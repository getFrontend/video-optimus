use crate::{
    encoding::{encoding_args, EncoderChoice},
    media::MediaTools,
    models::VideoJob,
    state::AppState,
    worker::update_job,
};
use std::{path::Path, sync::Arc};
use tauri::AppHandle;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
    sync::Notify,
};

struct EncodeContext<'a> {
    app: &'a AppHandle,
    state: &'a AppState,
    job: &'a VideoJob,
    tools: &'a MediaTools,
}

pub(crate) async fn encode_with_fallback(
    app: &AppHandle,
    state: &AppState,
    job: &VideoJob,
    tools: &MediaTools,
    encoder: &EncoderChoice,
    temporary: &Path,
    cancellation: Arc<Notify>,
) -> Result<bool, String> {
    let context = EncodeContext {
        app,
        state,
        job,
        tools,
    };
    let first = run_encoder(
        &context,
        &encoder.name,
        "copy",
        temporary,
        cancellation.clone(),
    )
    .await;
    if first.is_ok() {
        return first;
    }
    let mut active_encoder = encoder.name.as_str();
    let mut last_error = first.unwrap_err();
    if encoder.name.ends_with("_qsv") {
        if let Some(fallback) = encoder.software_fallback.as_deref().filter(|fallback| {
            tools
                .runtime
                .encoders
                .iter()
                .any(|item| item.name == **fallback && item.available)
        }) {
            let _ = tokio::fs::remove_file(temporary).await;
            update_job(state, app, &job.id, |current| {
                current.progress = 0.0;
                current.speed = None;
                current.eta_seconds = None;
                current.encoder = Some(format!("{fallback} · CPU fallback"));
            })
            .await;
            match run_encoder(&context, fallback, "copy", temporary, cancellation.clone()).await {
                Ok(cancelled) => return Ok(cancelled),
                Err(error) => {
                    active_encoder = fallback;
                    last_error = error;
                }
            }
        }
    }
    if is_audio_container_error(&last_error) && job.metadata.audio_tracks > 0 {
        let _ = tokio::fs::remove_file(temporary).await;
        update_job(state, app, &job.id, |current| {
            current.progress = 0.0;
            current.speed = None;
            current.eta_seconds = None;
            current.encoder = Some(format!("{active_encoder} · AAC audio fallback"));
        })
        .await;
        return run_encoder(&context, active_encoder, "aac", temporary, cancellation).await;
    }
    Err(last_error)
}

async fn run_encoder(
    context: &EncodeContext<'_>,
    encoder: &str,
    audio_codec: &str,
    temporary: &Path,
    cancellation: Arc<Notify>,
) -> Result<bool, String> {
    let ffmpeg = context
        .tools
        .ffmpeg
        .as_ref()
        .ok_or_else(|| "FFmpeg не знайдено.".to_string())?;
    let args = encoding_args(context.job, encoder, audio_codec, temporary);
    let mut child = Command::new(ffmpeg)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Не вдалося запустити FFmpeg: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Не вдалося прочитати перебіг FFmpeg.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Не вдалося прочитати журнал FFmpeg.".to_string())?;
    let progress_app = context.app.clone();
    let progress_state = context.state.clone();
    let progress_job = context.job.clone();
    let progress = tokio::spawn(async move {
        read_progress(stdout, progress_app, progress_state, progress_job).await;
    });
    let errors = tokio::spawn(async move { read_error_tail(stderr).await });

    let status = tokio::select! {
        result = child.wait() => result.map_err(|error| format!("Не вдалося дочекатися FFmpeg: {error}"))?,
        _ = cancellation.notified() => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            let _ = progress.await;
            let _ = errors.await;
            return Ok(true);
        }
    };
    let _ = progress.await;
    let error_text: String = errors.await.unwrap_or_default();
    if status.success() {
        Ok(false)
    } else {
        let detail = error_text
            .lines()
            .rev()
            .find(|line| is_audio_container_error(line))
            .or_else(|| error_text.lines().last())
            .unwrap_or("невідома помилка FFmpeg");
        Err(format!("{encoder}: {}", detail.trim()))
    }
}

fn is_audio_container_error(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("could not find tag for codec")
        || error.contains("codec not currently supported in container")
        || error.contains("is not supported in container")
}

async fn read_error_tail(mut stderr: tokio::process::ChildStderr) -> String {
    let mut tail = Vec::with_capacity(64 * 1024);
    let mut chunk = [0_u8; 4096];
    loop {
        let count = match stderr.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(count) => count,
        };
        tail.extend_from_slice(&chunk[..count]);
        if tail.len() > 64 * 1024 {
            let excess = tail.len() - 64 * 1024;
            tail.drain(..excess);
        }
    }
    let text = String::from_utf8_lossy(&tail);
    let limited: String = text.chars().rev().take(1400).collect();
    limited.chars().rev().collect()
}

async fn read_progress(
    stdout: tokio::process::ChildStdout,
    app: AppHandle,
    state: AppState,
    job: VideoJob,
) {
    let mut lines = BufReader::new(stdout).lines();
    let mut out_seconds = 0.0_f64;
    let mut last_sent = 0.0_f64;
    let mut speed = None;
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(value) = line
            .strip_prefix("out_time_us=")
            .or_else(|| line.strip_prefix("out_time_ms="))
        {
            out_seconds = value.parse::<f64>().unwrap_or_default() / 1_000_000.0;
        } else if let Some(value) = line.strip_prefix("speed=") {
            speed = Some(value.trim().to_string());
        }
        let progress = (out_seconds / job.metadata.duration_seconds * 100.0).clamp(0.0, 99.0);
        if progress - last_sent >= 0.15 || line == "progress=end" {
            last_sent = progress;
            let parsed_speed = speed
                .as_deref()
                .and_then(|value| value.trim_end_matches('x').parse::<f64>().ok());
            let eta_seconds = parsed_speed
                .filter(|value| *value > 0.0)
                .map(|value| (job.metadata.duration_seconds - out_seconds).max(0.0) / value);
            update_job(&state, &app, &job.id, |current| {
                current.progress = progress;
                current.speed = speed.clone();
                current.eta_seconds = eta_seconds;
            })
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_audio_container_error;

    #[test]
    fn recognizes_audio_container_copy_errors() {
        assert!(is_audio_container_error(
            "Could not find tag for codec vorbis, codec not currently supported in container"
        ));
        assert!(!is_audio_container_error("Error initializing an encoder"));
    }
}
