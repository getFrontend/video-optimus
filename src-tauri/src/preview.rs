use crate::{
    encoding::{select_encoder, target_video_bitrate},
    models::VideoMetadata,
    state::AppState,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[path = "preview_encode.rs"]
mod encode;
use encode::{calculate_quality_metrics, encode_fragment, PreviewEncodeRequest};

const PREVIEW_CLIP_SECONDS: f64 = 4.0;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub preview_id: String,
    pub job_id: String,
    pub clips: Vec<PreviewClip>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewClip {
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub optimized_path: String,
    pub ssim: Option<f64>,
    pub psnr: Option<f64>,
}

pub async fn create_preview(
    app: &AppHandle,
    state: &AppState,
    job_id: &str,
) -> Result<PreviewResult, String> {
    let job = state
        .jobs
        .read()
        .await
        .iter()
        .find(|job| job.id == job_id)
        .cloned()
        .ok_or_else(|| "Відео для попереднього перегляду не знайдено.".to_string())?;
    if job.metadata.is_hdr {
        return Err(
            "Попередній перегляд HDR недоступний, поки не гарантовано збереження HDR.".to_string(),
        );
    }
    if !job.metadata.duration_seconds.is_finite() || job.metadata.duration_seconds <= 0.0 {
        return Err("Тривалість відео не підходить для попереднього перегляду.".to_string());
    }
    if job.metadata.video_streams > 1 || job.metadata.data_streams > 0 {
        return Err(
            "Попередній перегляд підтримує одне відео без додаткових потоків даних.".to_string(),
        );
    }
    let tools = state.tools.read().await.clone();
    let ffmpeg = tools
        .ffmpeg
        .as_ref()
        .ok_or_else(|| "FFmpeg не знайдено.".to_string())?;
    let encoder = select_encoder(&job, &tools)
        .ok_or_else(|| "Не знайдено доступного кодера для попереднього перегляду.".to_string())?;
    let bitrate = target_video_bitrate(&job)?;
    let source = PathBuf::from(&job.path);
    let preview_id = Uuid::new_v4().to_string();
    let preview_directory = state.data_directory.join("previews").join(&preview_id);
    tokio::fs::create_dir_all(&preview_directory)
        .await
        .map_err(|error| format!("Не вдалося створити тимчасову теку: {error}"))?;

    if let Err(error) = app.asset_protocol_scope().allow_file(&source) {
        let _ = tokio::fs::remove_dir_all(&preview_directory).await;
        return Err(format!(
            "Не вдалося дозволити локальне відтворення джерела: {error}"
        ));
    }
    if let Err(error) = app
        .asset_protocol_scope()
        .allow_directory(&preview_directory, true)
    {
        let _ = app.asset_protocol_scope().forbid_file(&source);
        let _ = tokio::fs::remove_dir_all(&preview_directory).await;
        return Err(format!("Не вдалося дозволити тимчасові фрагменти: {error}"));
    }

    let starts = sample_starts(job.metadata.duration_seconds);
    let mut clips = Vec::with_capacity(starts.len());
    let mut preview_job = job.clone();
    preview_job.metadata = video_only_metadata(&job.metadata);

    for (index, start_seconds) in starts.into_iter().enumerate() {
        let duration_seconds =
            PREVIEW_CLIP_SECONDS.min(job.metadata.duration_seconds - start_seconds);
        let output = preview_directory.join(format!("fragment-{}.mp4", index + 1));
        let result = encode_fragment(PreviewEncodeRequest {
            ffmpeg,
            tools: &tools,
            job: &preview_job,
            encoder: &encoder.name,
            fallback: encoder.software_fallback.as_deref(),
            target_video_bitrate: bitrate,
            start_seconds,
            duration_seconds,
            output: &output,
        })
        .await;
        if let Err(error) = result {
            revoke_preview_access(app, &source, &preview_directory).await;
            return Err(error);
        }
        let fragment_metadata = match tools.analyze(&output).await {
            Ok(metadata) => metadata,
            Err(error) => {
                revoke_preview_access(app, &source, &preview_directory).await;
                return Err(format!("Не вдалося перевірити preview-фрагмент: {error}"));
            }
        };
        if fragment_metadata.width != job.metadata.width
            || fragment_metadata.height != job.metadata.height
            || fragment_metadata.duration_seconds > duration_seconds + 1.0
        {
            revoke_preview_access(app, &source, &preview_directory).await;
            return Err(
                "Preview-фрагмент не пройшов перевірку тривалості або роздільності.".to_string(),
            );
        }
        let (ssim, psnr) = calculate_quality_metrics(
            ffmpeg,
            &tools,
            &source,
            &output,
            start_seconds,
            duration_seconds,
        )
        .await;
        clips.push(PreviewClip {
            start_seconds,
            duration_seconds,
            optimized_path: output.to_string_lossy().into_owned(),
            ssim,
            psnr,
        });
    }

    Ok(PreviewResult {
        preview_id,
        job_id: job.id,
        clips,
    })
}

pub async fn remove_preview(
    app: &AppHandle,
    state: &AppState,
    preview_id: &str,
    job_id: &str,
) -> Result<(), String> {
    let preview_id = Uuid::parse_str(preview_id)
        .map_err(|_| "Ідентифікатор попереднього перегляду некоректний.".to_string())?;
    let preview_directory = state
        .data_directory
        .join("previews")
        .join(preview_id.to_string());
    if preview_directory.exists() {
        tokio::fs::remove_dir_all(&preview_directory)
            .await
            .map_err(|error| format!("Не вдалося видалити тимчасові фрагменти: {error}"))?;
    }
    let source = state
        .jobs
        .read()
        .await
        .iter()
        .find(|job| job.id == job_id)
        .map(|job| PathBuf::from(&job.path));
    if let Some(source) = source {
        let _ = app.asset_protocol_scope().forbid_file(source);
    }
    let _ = app
        .asset_protocol_scope()
        .forbid_directory(&preview_directory, true);
    Ok(())
}

pub async fn cleanup_stale(data_directory: &Path) {
    let preview_root = data_directory.join("previews");
    let _ = tokio::fs::remove_dir_all(preview_root).await;
}

fn sample_starts(duration: f64) -> Vec<f64> {
    let clip_length = PREVIEW_CLIP_SECONDS.min(duration.max(0.1));
    let latest_start = (duration - clip_length).max(0.0);
    let mut starts = Vec::with_capacity(3);
    for point in [0.15, 0.5, 0.85] {
        let start = (latest_start * point * 100.0).round() / 100.0;
        if starts
            .last()
            .is_none_or(|previous: &f64| (previous - start).abs() > 0.1)
        {
            starts.push(start);
        }
    }
    starts
}

fn video_only_metadata(metadata: &VideoMetadata) -> VideoMetadata {
    let mut preview = metadata.clone();
    preview.audio_tracks = 0;
    preview.audio_streams.clear();
    preview.subtitle_tracks = 0;
    preview.subtitle_streams.clear();
    preview.attachment_streams = 0;
    preview.data_streams = 0;
    preview.video_streams = 1;
    preview
}

async fn revoke_preview_access(app: &AppHandle, source: &Path, directory: &Path) {
    let _ = app.asset_protocol_scope().forbid_file(source);
    let _ = app.asset_protocol_scope().forbid_directory(directory, true);
    let _ = tokio::fs::remove_dir_all(directory).await;
}

#[cfg(test)]
mod tests {
    use super::{sample_starts, video_only_metadata};
    use crate::models::VideoMetadata;

    #[test]
    fn preview_samples_are_spread_across_the_source() {
        let starts = sample_starts(600.0);
        assert_eq!(starts.len(), 3);
        assert!(starts[0] < starts[1]);
        assert!(starts[1] < starts[2]);
        assert!(starts[2] + 4.0 <= 600.0);
    }

    #[test]
    fn short_sources_create_one_preview_sample() {
        assert_eq!(sample_starts(2.0), vec![0.0]);
    }

    #[test]
    fn preview_metadata_removes_non_video_streams() {
        let preview = video_only_metadata(&VideoMetadata {
            duration_seconds: 8.0,
            audio_tracks: 1,
            subtitle_tracks: 1,
            attachment_streams: 1,
            data_streams: 1,
            video_streams: 1,
            ..Default::default()
        });

        assert_eq!(preview.audio_tracks, 0);
        assert_eq!(preview.subtitle_tracks, 0);
        assert_eq!(preview.attachment_streams, 0);
        assert_eq!(preview.data_streams, 0);
    }
}
