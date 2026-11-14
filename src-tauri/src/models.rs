use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Analyzing,
    Preparing,
    Encoding,
    Validating,
    Completed,
    Failed,
    Cancelled,
    Skipped,
    Interrupted,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionMode {
    Smart,
    Fast,
    Maximum,
    Custom,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityProfile {
    NearOriginal,
    High,
    Balanced,
    Compact,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CustomVideoCodec {
    H264,
    Hevc,
    Av1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CustomDevice {
    Auto,
    Cpu,
    Qsv,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CustomPreset {
    Fast,
    Balanced,
    Quality,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OutputContainer {
    Auto,
    Mp4,
    Mkv,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CustomAudioCodec {
    Copy,
    Aac,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct CustomSettings {
    pub codec: CustomVideoCodec,
    pub device: CustomDevice,
    pub preset: CustomPreset,
    pub container: OutputContainer,
    pub audio_codec: CustomAudioCodec,
    pub audio_bitrate_kbps: u16,
    pub video_bitrate_kbps: Option<u32>,
}

impl Default for CustomSettings {
    fn default() -> Self {
        Self {
            codec: CustomVideoCodec::H264,
            device: CustomDevice::Auto,
            preset: CustomPreset::Balanced,
            container: OutputContainer::Auto,
            audio_codec: CustomAudioCodec::Copy,
            audio_bitrate_kbps: 192,
            video_bitrate_kbps: None,
        }
    }
}

impl CustomSettings {
    pub fn validate(&self) -> Result<(), String> {
        if !(96..=320).contains(&self.audio_bitrate_kbps) {
            return Err("Бітрейт аудіо має бути від 96 до 320 кбіт/с.".to_string());
        }
        if self
            .video_bitrate_kbps
            .is_some_and(|bitrate| !(100..=100_000).contains(&bitrate))
        {
            return Err("Бітрейт відео має бути від 100 до 100 000 кбіт/с.".to_string());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub duration_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub frame_rate: String,
    pub codec: String,
    pub bitrate: Option<u64>,
    pub is_vfr: bool,
    pub is_hdr: bool,
    pub audio_tracks: u32,
    pub subtitle_tracks: u32,
    #[serde(default)]
    pub video_bitrate: Option<u64>,
    #[serde(default)]
    pub pixel_format: Option<String>,
    #[serde(default)]
    pub bit_depth: Option<u32>,
    #[serde(default)]
    pub color_space: Option<String>,
    #[serde(default)]
    pub color_transfer: Option<String>,
    #[serde(default)]
    pub color_primaries: Option<String>,
    #[serde(default)]
    pub color_range: Option<String>,
    #[serde(default)]
    pub rotation_degrees: Option<f64>,
    #[serde(default)]
    pub audio_streams: Vec<AudioStreamInfo>,
    #[serde(default)]
    pub subtitle_streams: Vec<SubtitleStreamInfo>,
    #[serde(default)]
    pub attachment_streams: u32,
    #[serde(default)]
    pub data_streams: u32,
    #[serde(default = "default_video_streams")]
    pub video_streams: u32,
    #[serde(default)]
    pub video_stream_index: u32,
    #[serde(default)]
    pub attached_picture_streams: u32,
    #[serde(default)]
    pub unhandled_streams: u32,
}

fn default_video_streams() -> u32 {
    1
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    pub codec: String,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub sample_rate: Option<u32>,
    pub language: Option<String>,
    #[serde(default)]
    pub bitrate: Option<u64>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStreamInfo {
    pub codec: String,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoJob {
    pub id: String,
    pub path: String,
    pub file_name: String,
    pub source_size: u64,
    pub metadata: VideoMetadata,
    pub status: JobStatus,
    pub progress: f64,
    pub speed: Option<String>,
    pub eta_seconds: Option<f64>,
    pub output_path: Option<String>,
    pub output_size: Option<u64>,
    pub output_directory: Option<String>,
    pub mode: CompressionMode,
    pub quality: QualityProfile,
    #[serde(default)]
    pub custom_settings: CustomSettings,
    pub encoder: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
    pub elapsed_seconds: Option<f64>,
    #[serde(default)]
    pub target_size_bytes: Option<u64>,
    #[serde(default)]
    pub result_warning: Option<String>,
    #[serde(default)]
    pub diagnostic_log: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncoderAvailability {
    pub name: String,
    pub available: bool,
    pub hardware: bool,
    #[serde(default)]
    pub supported_options: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub encoders: Vec<EncoderAvailability>,
    #[serde(default)]
    pub quality_metrics: Vec<String>,
    #[serde(default)]
    pub logical_processors: usize,
    pub qsv_available: bool,
    pub ready: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub jobs: Vec<VideoJob>,
    pub runtime: RuntimeInfo,
    pub queue_running: bool,
    pub queue_paused: bool,
    pub total_saved_bytes: u64,
    pub settings: AppSettings,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub mode: CompressionMode,
    pub quality: QualityProfile,
    pub output_directory: Option<String>,
    #[serde(default)]
    pub target_size_bytes: Option<u64>,
    #[serde(default)]
    pub custom_settings: CustomSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            mode: CompressionMode::Smart,
            quality: QualityProfile::Balanced,
            output_directory: None,
            target_size_bytes: None,
            custom_settings: CustomSettings::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueOptions {
    pub paths: Vec<String>,
    pub mode: CompressionMode,
    pub quality: QualityProfile,
    pub output_directory: Option<String>,
    #[serde(default)]
    pub target_size_bytes: Option<u64>,
    #[serde(default)]
    pub custom_settings: CustomSettings,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueResult {
    pub added: Vec<VideoJob>,
    pub rejected: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, CustomSettings, VideoJob, VideoMetadata};

    #[test]
    fn legacy_queue_metadata_defaults_new_stream_fields() {
        let metadata: VideoMetadata = serde_json::from_str(
            r#"{
                "durationSeconds": 12.0,
                "width": 1920,
                "height": 1080,
                "frameRate": "30/1",
                "codec": "h264",
                "bitrate": 5000000,
                "isVfr": false,
                "isHdr": false,
                "audioTracks": 1,
                "subtitleTracks": 0
            }"#,
        )
        .unwrap();

        assert_eq!(metadata.video_streams, 1);
        assert_eq!(metadata.audio_streams.len(), 0);
        assert_eq!(metadata.data_streams, 0);
    }

    #[test]
    fn legacy_settings_default_target_size_to_unlimited() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "mode": "smart",
                "quality": "balanced",
                "outputDirectory": null
            }"#,
        )
        .unwrap();

        assert_eq!(settings.target_size_bytes, None);
        assert_eq!(settings.custom_settings, CustomSettings::default());
    }

    #[test]
    fn legacy_queue_jobs_default_custom_settings() {
        let job: VideoJob = serde_json::from_str(
            r#"{
                "id": "job",
                "path": "source.mp4",
                "fileName": "source.mp4",
                "sourceSize": 1024,
                "metadata": {
                    "durationSeconds": 10.0,
                    "width": 1280,
                    "height": 720,
                    "frameRate": "30/1",
                    "codec": "h264",
                    "bitrate": 2000000,
                    "isVfr": false,
                    "isHdr": false,
                    "audioTracks": 1,
                    "subtitleTracks": 0
                },
                "status": "pending",
                "progress": 0.0,
                "speed": null,
                "etaSeconds": null,
                "outputPath": null,
                "outputSize": null,
                "outputDirectory": null,
                "mode": "smart",
                "quality": "balanced",
                "encoder": null,
                "error": null,
                "createdAt": 0,
                "elapsedSeconds": null
            }"#,
        )
        .unwrap();

        assert_eq!(job.custom_settings, CustomSettings::default());
    }

    #[test]
    fn custom_settings_validate_manual_bitrate_ranges() {
        let mut settings = CustomSettings::default();
        assert!(settings.validate().is_ok());

        settings.video_bitrate_kbps = Some(99);
        assert!(settings.validate().is_err());

        settings.video_bitrate_kbps = None;
        settings.audio_bitrate_kbps = 500;
        assert!(settings.validate().is_err());
    }
}
