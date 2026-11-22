use crate::{
    encoding::{
        audio_codec_for_job, encoding_args, target_video_bitrate, EncoderChoice, EncodingPlan,
    },
    media::MediaTools,
    models::VideoJob,
    state::AppState,
    subprocess::hidden_console,
    worker::update_job,
};
use std::{path::Path, sync::Arc, time::Duration};
use tauri::AppHandle;
use tokio::{
    fs::OpenOptions,
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::Notify,
    time::Instant,
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
    let target_video_bitrate = target_video_bitrate(job)?;
    let audio_codec = audio_codec_for_job(job);
    let first = run_encoder(
        &context,
        &encoder.name,
        target_video_bitrate,
        audio_codec,
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
            match run_encoder(
                &context,
                fallback,
                target_video_bitrate,
                audio_codec,
                temporary,
                cancellation.clone(),
            )
            .await
            {
                Ok(cancelled) => return Ok(cancelled),
                Err(error) => {
                    active_encoder = fallback;
                    last_error = error;
                }
            }
        }
    }
    if audio_codec == "copy"
        && is_audio_container_error(&last_error)
        && job.metadata.audio_tracks > 0
    {
        let _ = tokio::fs::remove_file(temporary).await;
        update_job(state, app, &job.id, |current| {
            current.progress = 0.0;
            current.speed = None;
            current.eta_seconds = None;
            current.encoder = Some(format!("{active_encoder} · AAC audio fallback"));
        })
        .await;
        return run_encoder(
            &context,
            active_encoder,
            target_video_bitrate,
            "aac",
            temporary,
            cancellation,
        )
        .await;
    }
    Err(last_error)
}

async fn run_encoder(
    context: &EncodeContext<'_>,
    encoder: &str,
    target_video_bitrate: Option<u64>,
    audio_codec: &str,
    temporary: &Path,
    cancellation: Arc<Notify>,
) -> Result<bool, String> {
    if target_video_bitrate.is_some() && matches!(encoder, "libx264" | "libx265") {
        let pass_logfile = temporary.with_extension("passlog");
        cleanup_pass_logs(&pass_logfile);
        let first_pass = run_encoder_pass(
            context,
            encoder,
            target_video_bitrate,
            audio_codec,
            temporary,
            Some(1),
            Some(&pass_logfile),
            (0.0, 49.0),
            cancellation.clone(),
        )
        .await;
        match first_pass {
            Ok(true) => {
                cleanup_pass_logs(&pass_logfile);
                return Ok(true);
            }
            Ok(false) => {
                let second_pass = run_encoder_pass(
                    context,
                    encoder,
                    target_video_bitrate,
                    audio_codec,
                    temporary,
                    Some(2),
                    Some(&pass_logfile),
                    (50.0, 99.0),
                    cancellation.clone(),
                )
                .await;
                cleanup_pass_logs(&pass_logfile);
                match second_pass {
                    Ok(false) => return Ok(false),
                    Ok(true) => return Ok(true),
                    Err(two_pass_error) => {
                        let _ = tokio::fs::remove_file(temporary).await;
                        let single_pass = run_encoder_pass(
                            context,
                            encoder,
                            target_video_bitrate,
                            audio_codec,
                            temporary,
                            None,
                            None,
                            (0.0, 99.0),
                            cancellation,
                        )
                        .await;
                        return single_pass.map_err(|single_pass_error| {
                            format!(
                                "Two-pass encoding failed ({two_pass_error}); \
                                 single-pass fallback failed ({single_pass_error})."
                            )
                        });
                    }
                }
            }
            Err(two_pass_error) => {
                cleanup_pass_logs(&pass_logfile);
                let _ = tokio::fs::remove_file(temporary).await;
                let single_pass = run_encoder_pass(
                    context,
                    encoder,
                    target_video_bitrate,
                    audio_codec,
                    temporary,
                    None,
                    None,
                    (0.0, 99.0),
                    cancellation,
                )
                .await;
                return single_pass.map_err(|single_pass_error| {
                    format!(
                        "Two-pass encoding failed ({two_pass_error}); \
                         single-pass fallback failed ({single_pass_error})."
                    )
                });
            }
        }
    }

    run_encoder_pass(
        context,
        encoder,
        target_video_bitrate,
        audio_codec,
        temporary,
        None,
        None,
        (0.0, 99.0),
        cancellation,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn run_encoder_pass(
    context: &EncodeContext<'_>,
    encoder: &str,
    target_video_bitrate: Option<u64>,
    audio_codec: &str,
    temporary: &Path,
    pass: Option<u8>,
    pass_logfile: Option<&Path>,
    progress_range: (f64, f64),
    cancellation: Arc<Notify>,
) -> Result<bool, String> {
    let ffmpeg = context
        .tools
        .ffmpeg
        .as_ref()
        .ok_or_else(|| "FFmpeg не знайдено.".to_string())?;
    let supported_options = context
        .tools
        .runtime
        .encoders
        .iter()
        .find(|item| item.name == encoder && item.available)
        .map(|item| item.supported_options.as_slice())
        .unwrap_or_default();
    let args = encoding_args(
        context.job,
        EncodingPlan {
            encoder,
            supported_options,
            target_video_bitrate,
            pass,
            pass_logfile,
            audio_codec,
            include_audio: true,
            start_seconds: None,
            duration_seconds: None,
            temporary,
        },
    );
    let mut child = hidden_console(Command::new(ffmpeg))
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
        read_progress(
            stdout,
            progress_app,
            progress_state,
            progress_job,
            progress_range,
        )
        .await;
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
        let log_path = write_ffmpeg_log(context, encoder, pass, &error_text).await;
        if let Some(path) = log_path {
            let path = path.to_string_lossy().into_owned();
            update_job(context.state, context.app, &context.job.id, |current| {
                current.diagnostic_log = Some(path);
            })
            .await;
        }
        let detail = error_text
            .lines()
            .rev()
            .find(|line| is_audio_container_error(line))
            .or_else(|| error_text.lines().last())
            .unwrap_or("невідома помилка FFmpeg");
        Err(format!("{encoder}: {}", detail.trim()))
    }
}

fn cleanup_pass_logs(pass_logfile: &Path) {
    let Some(directory) = pass_logfile.parent() else {
        return;
    };
    let prefix = pass_logfile
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if let Ok(entries) = std::fs::read_dir(directory) {
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(prefix.as_ref())
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

async fn write_ffmpeg_log(
    context: &EncodeContext<'_>,
    encoder: &str,
    pass: Option<u8>,
    error_text: &str,
) -> Option<std::path::PathBuf> {
    let directory = context.state.data_directory.join("logs");
    tokio::fs::create_dir_all(&directory).await.ok()?;
    let path = directory.join(format!("{}.log", context.job.id));
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .ok()?;
    let header = format!("\nEncoder: {encoder}; pass: {pass:?}\n");
    file.write_all(header.as_bytes()).await.ok()?;
    file.write_all(error_text.as_bytes()).await.ok()?;
    file.write_all(b"\n").await.ok()?;
    Some(path)
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
    progress_range: (f64, f64),
) {
    let mut lines = BufReader::new(stdout).lines();
    let mut out_seconds = 0.0_f64;
    let mut last_sent = 0.0_f64;
    let mut last_update = Instant::now();
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
        let fraction = (out_seconds / job.metadata.duration_seconds).clamp(0.0, 1.0);
        let progress = progress_range.0 + fraction * (progress_range.1 - progress_range.0);
        let now = Instant::now();
        let should_emit = (progress - last_sent >= 0.5
            && now.duration_since(last_update) >= Duration::from_millis(500))
            || line == "progress=end";
        if should_emit {
            last_sent = progress;
            last_update = now;
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
