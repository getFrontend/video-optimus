use crate::{
    encoding::{encoding_args, EncodingPlan},
    media::MediaTools,
    models::VideoJob,
};
use std::path::Path;
use tokio::{process::Command, time::timeout, time::Duration};

const PREVIEW_TIMEOUT_SECONDS: u64 = 120;

pub(super) struct PreviewEncodeRequest<'a> {
    pub ffmpeg: &'a Path,
    pub tools: &'a MediaTools,
    pub job: &'a VideoJob,
    pub encoder: &'a str,
    pub fallback: Option<&'a str>,
    pub target_video_bitrate: Option<u64>,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub output: &'a Path,
}

pub(super) async fn encode_fragment(request: PreviewEncodeRequest<'_>) -> Result<(), String> {
    let PreviewEncodeRequest {
        ffmpeg,
        tools,
        job,
        encoder,
        fallback,
        target_video_bitrate,
        start_seconds,
        duration_seconds,
        output,
    } = request;
    let first = run_encoder(
        ffmpeg,
        tools,
        job,
        encoder,
        target_video_bitrate,
        start_seconds,
        duration_seconds,
        output,
    )
    .await;
    if first.is_ok() {
        return first;
    }
    if let Some(fallback) = fallback.filter(|fallback| {
        tools
            .runtime
            .encoders
            .iter()
            .any(|item| item.name == *fallback && item.available)
    }) {
        let _ = tokio::fs::remove_file(output).await;
        return run_encoder(
            ffmpeg,
            tools,
            job,
            fallback,
            target_video_bitrate,
            start_seconds,
            duration_seconds,
            output,
        )
        .await;
    }
    first
}

#[allow(clippy::too_many_arguments)]
async fn run_encoder(
    ffmpeg: &Path,
    tools: &MediaTools,
    job: &VideoJob,
    encoder: &str,
    target_video_bitrate: Option<u64>,
    start_seconds: f64,
    duration_seconds: f64,
    output: &Path,
) -> Result<(), String> {
    let supported_options = tools
        .runtime
        .encoders
        .iter()
        .find(|item| item.name == encoder && item.available)
        .map(|item| item.supported_options.as_slice())
        .unwrap_or_default();
    let args = encoding_args(
        job,
        EncodingPlan {
            encoder,
            supported_options,
            target_video_bitrate,
            pass: None,
            pass_logfile: None,
            audio_codec: "copy",
            include_audio: false,
            start_seconds: Some(start_seconds),
            duration_seconds: Some(duration_seconds),
            temporary: output,
        },
    );
    let result = timeout(
        Duration::from_secs(PREVIEW_TIMEOUT_SECONDS),
        Command::new(ffmpeg).args(args).kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| "Час створення preview-фрагмента вичерпано.".to_string())?
    .map_err(|error| format!("Не вдалося запустити FFmpeg: {error}"))?;
    if !result.status.success() {
        let detail = String::from_utf8_lossy(&result.stderr);
        let detail = detail.trim().lines().last().unwrap_or("невідома помилка");
        return Err(format!("Не вдалося створити preview-фрагмент: {detail}"));
    }
    if tokio::fs::metadata(output)
        .await
        .map(|metadata| metadata.len() == 0)
        .unwrap_or(true)
    {
        return Err("FFmpeg не створив preview-файл.".to_string());
    }
    Ok(())
}

pub(super) async fn calculate_quality_metrics(
    ffmpeg: &Path,
    tools: &MediaTools,
    source: &Path,
    optimized: &Path,
    start_seconds: f64,
    duration_seconds: f64,
) -> (Option<f64>, Option<f64>) {
    let ssim = if tools
        .runtime
        .quality_metrics
        .iter()
        .any(|item| item == "ssim")
    {
        run_quality_metric(
            ffmpeg,
            source,
            optimized,
            start_seconds,
            duration_seconds,
            "ssim",
            "All:",
        )
        .await
    } else {
        None
    };
    let psnr = if tools
        .runtime
        .quality_metrics
        .iter()
        .any(|item| item == "psnr")
    {
        run_quality_metric(
            ffmpeg,
            source,
            optimized,
            start_seconds,
            duration_seconds,
            "psnr",
            "average:",
        )
        .await
    } else {
        None
    };
    (ssim, psnr)
}

async fn run_quality_metric(
    ffmpeg: &Path,
    source: &Path,
    optimized: &Path,
    start_seconds: f64,
    duration_seconds: f64,
    filter: &str,
    score_label: &str,
) -> Option<f64> {
    let filter_graph = format!("[0:v:0][1:v:0]{filter}");
    let result = timeout(
        Duration::from_secs(PREVIEW_TIMEOUT_SECONDS),
        Command::new(ffmpeg)
            .args(["-hide_banner", "-loglevel", "info", "-ss"])
            .arg(format!("{start_seconds:.3}"))
            .args(["-t"])
            .arg(format!("{duration_seconds:.3}"))
            .args(["-i"])
            .arg(source)
            .args(["-i"])
            .arg(optimized)
            .args(["-filter_complex", &filter_graph, "-f", "null", "-"])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !result.status.success() {
        return None;
    }
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    parse_metric_score(&text, score_label)
}

fn parse_metric_score(text: &str, label: &str) -> Option<f64> {
    text.lines().rev().find_map(|line| {
        line.split_whitespace().find_map(|part| {
            part.strip_prefix(label)
                .and_then(|value| value.trim_end_matches(')').parse::<f64>().ok())
        })
    })
}

#[cfg(test)]
mod tests {
    use super::parse_metric_score;

    #[test]
    fn parses_ffmpeg_ssim_and_psnr_scores() {
        assert_eq!(
            parse_metric_score("SSIM Y:0.99 U:0.99 V:0.98 All:0.991234 (20.1)", "All:"),
            Some(0.991234)
        );
        assert_eq!(
            parse_metric_score("PSNR y:35.2 average:36.8 min:30 max:50", "average:"),
            Some(36.8)
        );
    }
}
