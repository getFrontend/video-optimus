use crate::environment::refresh_process_environment;
use crate::models::{EncoderAvailability, RuntimeInfo, VideoMetadata};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::{process::Command, time::Duration};

#[derive(Clone)]
pub struct MediaTools {
    pub ffmpeg: Option<PathBuf>,
    pub ffprobe: Option<PathBuf>,
    pub runtime: RuntimeInfo,
}

const ENCODERS: [(&str, bool); 6] = [
    ("h264_qsv", true),
    ("hevc_qsv", true),
    ("av1_qsv", true),
    ("libx264", false),
    ("libx265", false),
    ("libsvtav1", false),
];

impl MediaTools {
    pub fn empty() -> Self {
        Self {
            ffmpeg: None,
            ffprobe: None,
            runtime: RuntimeInfo {
                ffmpeg_path: None,
                ffprobe_path: None,
                ffmpeg_version: None,
                encoders: Vec::new(),
                qsv_available: false,
                ready: false,
            },
        }
    }

    pub async fn discover() -> Self {
        if find_binary("ffmpeg").is_none() || find_binary("ffprobe").is_none() {
            refresh_process_environment().await;
        }
        let ffmpeg = find_binary("ffmpeg");
        let ffprobe = find_binary("ffprobe");
        let mut available = Vec::new();
        let mut version = None;

        if let Some(path) = ffmpeg.as_ref() {
            let output = Command::new(path)
                .args(["-hide_banner", "-encoders"])
                .output()
                .await;
            if let Ok(output) = output {
                let listing = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                for (name, hardware) in ENCODERS {
                    available.push(EncoderAvailability {
                        name: name.to_string(),
                        available: listing
                            .lines()
                            .any(|line| line.split_whitespace().any(|part| part == name)),
                        hardware,
                    });
                }
            }

            if let Ok(output) = Command::new(path).args(["-version"]).output().await {
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                version = text.lines().next().map(str::to_string);
            }
        }

        let mut qsv_available = false;
        if let Some(path) = ffmpeg.as_ref() {
            for encoder in available
                .iter()
                .filter(|encoder| encoder.hardware && encoder.available)
            {
                if test_qsv(path, &encoder.name).await {
                    qsv_available = true;
                    break;
                }
            }
        }

        let ready = ffmpeg.is_some() && ffprobe.is_some();
        Self {
            runtime: RuntimeInfo {
                ffmpeg_path: ffmpeg.as_ref().map(|path| path.display().to_string()),
                ffprobe_path: ffprobe.as_ref().map(|path| path.display().to_string()),
                ffmpeg_version: version,
                encoders: available,
                qsv_available,
                ready,
            },
            ffmpeg,
            ffprobe,
        }
    }

    pub async fn analyze(&self, path: &Path) -> Result<VideoMetadata, String> {
        let probe = self.ffprobe.as_ref().ok_or_else(missing_tools)?;
        let output = Command::new(probe)
            .args([
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
            ])
            .arg(path)
            .output()
            .await
            .map_err(|error| format!("Не вдалося запустити FFprobe: {error}"))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Не вдалося прочитати відео: {}",
                detail
                    .trim()
                    .lines()
                    .last()
                    .unwrap_or("формат не розпізнано")
            ));
        }

        let document: Value = serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("Некоректна відповідь FFprobe: {error}"))?;
        let streams = document["streams"]
            .as_array()
            .ok_or_else(|| "У файлі не знайдено медіапотоків".to_string())?;
        let video = streams
            .iter()
            .find(|stream| stream["codec_type"] == "video")
            .ok_or_else(|| "У файлі не знайдено відеодоріжки".to_string())?;
        let format = &document["format"];
        let average_rate = string(video, "avg_frame_rate");
        let nominal_rate = string(video, "r_frame_rate");
        let frame_rate = if average_rate == "0/0" || average_rate == "N/A" {
            nominal_rate.clone()
        } else {
            average_rate.clone()
        };
        let transfer = string(video, "color_transfer");

        Ok(VideoMetadata {
            duration_seconds: number(format, "duration")
                .ok_or_else(|| "Не вдалося визначити тривалість відео".to_string())?,
            width: number(video, "width").unwrap_or_default() as u32,
            height: number(video, "height").unwrap_or_default() as u32,
            frame_rate,
            codec: string(video, "codec_name"),
            bitrate: number(format, "bit_rate").map(|value| value as u64),
            is_vfr: match (rate_to_float(&average_rate), rate_to_float(&nominal_rate)) {
                (Some(average), Some(nominal)) if nominal > 0.0 => {
                    (average - nominal).abs() / nominal > 0.01
                }
                _ => false,
            },
            is_hdr: matches!(transfer.as_str(), "smpte2084" | "arib-std-b67"),
            audio_tracks: streams
                .iter()
                .filter(|stream| stream["codec_type"] == "audio")
                .count() as u32,
            subtitle_tracks: streams
                .iter()
                .filter(|stream| stream["codec_type"] == "subtitle")
                .count() as u32,
        })
    }
}

async fn test_qsv(ffmpeg: &Path, encoder: &str) -> bool {
    let result = tokio::time::timeout(
        Duration::from_secs(4),
        Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-init_hw_device",
                "qsv=hw",
                "-filter_hw_device",
                "hw",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=64x64:r=1",
                "-frames:v",
                "1",
                "-vf",
                "format=nv12,hwupload",
                "-c:v",
                encoder,
                "-f",
                "null",
                "-",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await;
    matches!(result, Ok(Ok(output)) if output.status.success())
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value[key]
        .as_f64()
        .or_else(|| value[key].as_str().and_then(|text| text.parse().ok()))
}

fn string(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or("unknown").to_string()
}

fn rate_to_float(rate: &str) -> Option<f64> {
    let (numerator, denominator) = rate.split_once('/')?;
    let numerator = numerator.parse::<f64>().ok()?;
    let denominator = denominator.parse::<f64>().ok()?;
    (denominator != 0.0).then_some(numerator / denominator)
}

fn missing_tools() -> String {
    "FFmpeg і FFprobe не знайдено. Додайте їхню папку до PATH або вкажіть шляхи у змінних VIDEO_OPTIMUS_FFMPEG і VIDEO_OPTIMUS_FFPROBE.".to_string()
}

fn find_binary(name: &str) -> Option<PathBuf> {
    let executable = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var(format!("VIDEO_OPTIMUS_{}", name.to_uppercase())) {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(directory) = current.parent() {
            candidates.extend([
                directory.join(&executable),
                directory.join("resources").join(&executable),
                directory.join("bin").join(&executable),
            ]);
        }
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .or_else(|| {
            std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths)
                    .map(|directory| directory.join(&executable))
                    .find(|path| path.is_file())
            })
        })
}

#[cfg(test)]
mod tests {
    use super::rate_to_float;

    #[test]
    fn parses_fractional_frame_rates() {
        assert!((rate_to_float("30000/1001").unwrap() - 29.970_029_97).abs() < 0.001);
    }

    #[test]
    fn rejects_invalid_frame_rates() {
        assert_eq!(rate_to_float("0/0"), None);
        assert_eq!(rate_to_float("not-a-rate"), None);
    }
}
