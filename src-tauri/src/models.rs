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

#[derive(Clone, Debug, Deserialize, Serialize)]
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
    pub encoder: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
    pub elapsed_seconds: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncoderAvailability {
    pub name: String,
    pub available: bool,
    pub hardware: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub encoders: Vec<EncoderAvailability>,
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            mode: CompressionMode::Smart,
            quality: QualityProfile::Balanced,
            output_directory: None,
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueResult {
    pub added: Vec<VideoJob>,
    pub rejected: Vec<String>,
}
