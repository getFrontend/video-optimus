use crate::environment::refresh_process_environment;
use crate::models::{
    AudioStreamInfo, EncoderAvailability, RuntimeInfo, SubtitleStreamInfo, VideoMetadata,
};
use crate::subprocess::hidden_console;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::{
    process::Command,
    time::{timeout, Duration},
};

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
                quality_metrics: Vec::new(),
                logical_processors: logical_processor_count(),
                processor_name: None,
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
            let output = hidden_console(Command::new(path))
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
                    let listed = listing
                        .lines()
                        .any(|line| line.split_whitespace().any(|part| part == name));
                    let supported_options = if listed {
                        encoder_options(path, name).await
                    } else {
                        Vec::new()
                    };
                    let usable = if listed && hardware {
                        test_qsv(path, name).await
                    } else {
                        listed
                    };
                    available.push(EncoderAvailability {
                        name: name.to_string(),
                        available: usable,
                        hardware,
                        supported_options,
                    });
                }
            }

            if let Ok(output) = hidden_console(Command::new(path))
                .args(["-version"])
                .output()
                .await
            {
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                version = text.lines().next().map(str::to_string);
            }
        }

        let qsv_available = available
            .iter()
            .any(|encoder| encoder.hardware && encoder.available);
        let quality_metrics = if let Some(path) = ffmpeg.as_ref() {
            detect_quality_metrics(path).await
        } else {
            Vec::new()
        };
        let processor_name = detect_processor_name().await;

        let ready = ffmpeg.is_some() && ffprobe.is_some();
        Self {
            runtime: RuntimeInfo {
                ffmpeg_path: ffmpeg.as_ref().map(|path| path.display().to_string()),
                ffprobe_path: ffprobe.as_ref().map(|path| path.display().to_string()),
                ffmpeg_version: version,
                encoders: available,
                quality_metrics,
                logical_processors: logical_processor_count(),
                processor_name,
                qsv_available,
                ready,
            },
            ffmpeg,
            ffprobe,
        }
    }

    pub async fn analyze(&self, path: &Path) -> Result<VideoMetadata, String> {
        let probe = self.ffprobe.as_ref().ok_or_else(missing_tools)?;
        let mut command = hidden_console(Command::new(probe));
        command.kill_on_drop(true);
        let output = timeout(
            Duration::from_secs(60),
            command
                .args([
                    "-v",
                    "error",
                    "-show_format",
                    "-show_streams",
                    "-of",
                    "json",
                ])
                .arg(path)
                .output(),
        )
        .await
        .map_err(|_| "Час аналізу FFprobe перевищив 60 секунд.".to_string())?
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
            .find(|stream| {
                stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] != 1
            })
            .or_else(|| {
                streams
                    .iter()
                    .find(|stream| stream["codec_type"] == "video")
            })
            .ok_or_else(|| "У файлі не знайдено відеодоріжки".to_string())?;
        let format = &document["format"];
        let average_rate = string(video, "avg_frame_rate");
        let nominal_rate = string(video, "r_frame_rate");
        let frame_rate = if average_rate == "0/0" || average_rate == "N/A" {
            nominal_rate.clone()
        } else {
            average_rate.clone()
        };
        let pixel_format = optional_string(video, "pix_fmt");
        let transfer = optional_string(video, "color_transfer");
        let audio_streams: Vec<AudioStreamInfo> = streams
            .iter()
            .filter(|stream| stream["codec_type"] == "audio")
            .map(|stream| AudioStreamInfo {
                codec: string(stream, "codec_name"),
                channels: number(stream, "channels").map(|value| value as u32),
                channel_layout: optional_string(stream, "channel_layout"),
                sample_rate: number(stream, "sample_rate").map(|value| value as u32),
                language: optional_tag(stream, "language"),
                bitrate: number(stream, "bit_rate").map(|value| value as u64),
            })
            .collect();
        let subtitle_streams: Vec<SubtitleStreamInfo> = streams
            .iter()
            .filter(|stream| stream["codec_type"] == "subtitle")
            .map(|stream| SubtitleStreamInfo {
                codec: string(stream, "codec_name"),
                language: optional_tag(stream, "language"),
                title: optional_tag(stream, "title"),
            })
            .collect();

        Ok(VideoMetadata {
            duration_seconds: number(format, "duration")
                .ok_or_else(|| "Не вдалося визначити тривалість відео".to_string())?,
            width: number(video, "width").unwrap_or_default() as u32,
            height: number(video, "height").unwrap_or_default() as u32,
            frame_rate,
            codec: string(video, "codec_name"),
            bitrate: number(video, "bit_rate")
                .or_else(|| number(format, "bit_rate"))
                .map(|value| value as u64),
            is_vfr: match (rate_to_float(&average_rate), rate_to_float(&nominal_rate)) {
                (Some(average), Some(nominal)) if nominal > 0.0 => {
                    (average - nominal).abs() / nominal > 0.01
                }
                _ => false,
            },
            is_hdr: matches!(transfer.as_deref(), Some("smpte2084" | "arib-std-b67")),
            audio_tracks: audio_streams.len() as u32,
            subtitle_tracks: subtitle_streams.len() as u32,
            video_bitrate: number(video, "bit_rate").map(|value| value as u64),
            bit_depth: bit_depth(video, pixel_format.as_deref()),
            pixel_format,
            color_space: optional_string(video, "color_space"),
            color_transfer: transfer,
            color_primaries: optional_string(video, "color_primaries"),
            color_range: optional_string(video, "color_range"),
            rotation_degrees: rotation_degrees(video),
            audio_streams,
            subtitle_streams,
            attachment_streams: streams
                .iter()
                .filter(|stream| stream["codec_type"] == "attachment")
                .count() as u32,
            data_streams: streams
                .iter()
                .filter(|stream| stream["codec_type"] == "data")
                .count() as u32,
            video_streams: streams
                .iter()
                .filter(|stream| {
                    stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] != 1
                })
                .count() as u32,
            video_stream_index: number(video, "index").unwrap_or_default() as u32,
            attached_picture_streams: streams
                .iter()
                .filter(|stream| {
                    stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] == 1
                })
                .count() as u32,
            unhandled_streams: streams
                .iter()
                .filter(|stream| {
                    !matches!(
                        stream["codec_type"].as_str(),
                        Some("video" | "audio" | "subtitle" | "attachment" | "data")
                    )
                })
                .count() as u32,
        })
    }

    pub async fn thumbnail(&self, path: &Path, duration_seconds: f64) -> Result<Vec<u8>, String> {
        let ffmpeg = self.ffmpeg.as_ref().ok_or_else(missing_tools)?;
        let seek_seconds = if duration_seconds.is_finite() {
            (duration_seconds.max(0.0) * 0.1).min(30.0)
        } else {
            0.0
        };
        let result = timeout(
            Duration::from_secs(15),
            hidden_console(Command::new(ffmpeg))
                .args(["-hide_banner", "-loglevel", "error", "-ss"])
                .arg(format!("{seek_seconds:.3}"))
                .args(["-i"])
                .arg(path)
                .args([
                    "-frames:v",
                    "1",
                    "-an",
                    "-vf",
                    "scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2",
                    "-q:v",
                    "5",
                    "-f",
                    "image2pipe",
                    "-vcodec",
                    "mjpeg",
                    "pipe:1",
                ])
                .kill_on_drop(true)
                .output(),
        )
        .await
        .map_err(|_| "Час створення мініатюри вичерпано.".to_string())?
        .map_err(|error| format!("Не вдалося створити мініатюру: {error}"))?;

        if !result.status.success() || result.stdout.is_empty() {
            return Err("Не вдалося створити мініатюру відео.".to_string());
        }
        Ok(result.stdout)
    }
}

async fn test_qsv(ffmpeg: &Path, encoder: &str) -> bool {
    let result = tokio::time::timeout(
        Duration::from_secs(4),
        hidden_console(Command::new(ffmpeg))
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

async fn encoder_options(ffmpeg: &Path, encoder: &str) -> Vec<String> {
    let query = format!("encoder={encoder}");
    let result = timeout(
        Duration::from_secs(2),
        hidden_console(Command::new(ffmpeg))
            .args(["-hide_banner", "-h", &query])
            .kill_on_drop(true)
            .output(),
    )
    .await;
    let Ok(Ok(output)) = result else {
        return Vec::new();
    };
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_encoder_options(&text)
}

async fn detect_quality_metrics(ffmpeg: &Path) -> Vec<String> {
    let result = timeout(
        Duration::from_secs(4),
        hidden_console(Command::new(ffmpeg))
            .args(["-hide_banner", "-filters"])
            .kill_on_drop(true)
            .output(),
    )
    .await;
    let Ok(Ok(output)) = result else {
        return Vec::new();
    };
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_quality_metrics(&text)
}

fn parse_quality_metrics(text: &str) -> Vec<String> {
    let available: Vec<&str> = text
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let flags = parts.next()?;
            let name = parts.next()?;
            let is_filter_line = (2..=3).contains(&flags.len())
                && flags
                    .chars()
                    .all(|flag| matches!(flag, 'T' | 'S' | 'C' | '.'));
            is_filter_line.then_some(name)
        })
        .collect();
    ["ssim", "psnr"]
        .into_iter()
        .filter(|metric| available.contains(metric))
        .map(str::to_string)
        .collect()
}

fn parse_encoder_options(text: &str) -> Vec<String> {
    let mut options = Vec::new();
    for line in text.lines() {
        let Some(token) = line.split_whitespace().next() else {
            continue;
        };
        if let Some(option) = token.strip_prefix('-') {
            if !option.is_empty() && !options.iter().any(|existing| existing == option) {
                options.push(option.to_string());
            }
        }
    }
    options
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value[key]
        .as_f64()
        .or_else(|| value[key].as_str().and_then(|text| text.parse().ok()))
}

fn string(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or("unknown").to_string()
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value[key]
        .as_str()
        .filter(|text| !text.is_empty() && *text != "unknown" && *text != "N/A")
        .map(str::to_string)
}

fn optional_tag(stream: &Value, key: &str) -> Option<String> {
    stream["tags"][key]
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn bit_depth(stream: &Value, pixel_format: Option<&str>) -> Option<u32> {
    number(stream, "bits_per_raw_sample")
        .filter(|depth| *depth > 0.0)
        .map(|depth| depth as u32)
        .or_else(|| pixel_format.and_then(bit_depth_from_pixel_format))
}

fn bit_depth_from_pixel_format(pixel_format: &str) -> Option<u32> {
    let suffix = pixel_format.rsplit_once('p').map(|(_, suffix)| suffix);
    if let Some(suffix) = suffix {
        let digits: String = suffix.chars().take_while(char::is_ascii_digit).collect();
        if !digits.is_empty() {
            return digits.parse().ok();
        }
    }

    matches!(
        pixel_format,
        "yuv420p"
            | "yuv422p"
            | "yuv444p"
            | "yuv410p"
            | "yuv411p"
            | "yuv440p"
            | "yuvj420p"
            | "yuvj422p"
            | "yuvj444p"
            | "yuvj440p"
            | "yuva420p"
            | "yuva422p"
            | "yuva444p"
            | "gbrp"
            | "gbrap"
            | "nv12"
            | "nv21"
            | "yuyv422"
            | "uyvy422"
            | "yvyu422"
            | "rgb24"
            | "bgr24"
            | "rgba"
            | "bgra"
            | "rgb0"
            | "bgr0"
            | "0rgb"
            | "0bgr"
            | "gray"
            | "gray8"
    )
    .then_some(8)
}

fn rotation_degrees(stream: &Value) -> Option<f64> {
    number(&stream["tags"], "rotate").or_else(|| {
        stream["side_data_list"]
            .as_array()?
            .iter()
            .find_map(|side_data| number(side_data, "rotation"))
    })
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

fn logical_processor_count() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
}

#[cfg(windows)]
async fn detect_processor_name() -> Option<String> {
    let result = timeout(
        Duration::from_secs(2),
        hidden_console(Command::new("reg.exe"))
            .args([
                "query",
                r"HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                "/v",
                "ProcessorNameString",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !result.status.success() {
        return None;
    }
    parse_processor_name(&String::from_utf8_lossy(&result.stdout))
}

#[cfg(not(windows))]
async fn detect_processor_name() -> Option<String> {
    None
}

fn parse_processor_name(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (_, value) = line.split_once("REG_SZ")?;
        let name = value.trim();
        (!name.is_empty()).then(|| name.to_string())
    })
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
    use super::{
        bit_depth, parse_encoder_options, parse_processor_name, parse_quality_metrics,
        rate_to_float, rotation_degrees,
    };
    use serde_json::json;

    #[test]
    fn parses_fractional_frame_rates() {
        assert!((rate_to_float("30000/1001").unwrap() - 29.970_029_97).abs() < 0.001);
    }

    #[test]
    fn rejects_invalid_frame_rates() {
        assert_eq!(rate_to_float("0/0"), None);
        assert_eq!(rate_to_float("not-a-rate"), None);
    }

    #[test]
    fn reads_bit_depth_from_pixel_format() {
        let stream = json!({ "bits_per_raw_sample": "0" });
        assert_eq!(bit_depth(&stream, Some("yuv420p10le")), Some(10));
        assert_eq!(bit_depth(&stream, Some("yuv420p")), Some(8));
        assert_eq!(bit_depth(&stream, Some("yuvj420p10le")), Some(10));
        assert_eq!(bit_depth(&stream, Some("p010le")), Some(10));
        assert_eq!(bit_depth(&stream, Some("nv12")), Some(8));
        assert_eq!(bit_depth(&stream, Some("unknown")), None);
    }

    #[test]
    fn reported_bit_depth_takes_precedence_over_pixel_format_inference() {
        let stream = json!({ "bits_per_raw_sample": "10" });

        assert_eq!(bit_depth(&stream, Some("yuv420p")), Some(10));
    }

    #[test]
    fn reads_rotation_from_side_data() {
        let stream = json!({
            "side_data_list": [{ "rotation": -90.0 }]
        });
        assert_eq!(rotation_degrees(&stream), Some(-90.0));
    }

    #[test]
    fn parses_encoder_option_names_without_duplicates() {
        let options = parse_encoder_options(
            "Encoder options:\n  -preset <int> encoder preset\n  -crf <int> quality\n  -preset <int> duplicate",
        );
        assert_eq!(options, ["preset", "crf"]);
    }

    #[test]
    fn detects_only_available_quality_filters() {
        let filters = parse_quality_metrics(
            "Filters:\n T.. ssim V->V SSIM\n ..C psnr V->V PSNR\n ... scale V->V Scale",
        );
        assert_eq!(filters, ["ssim", "psnr"]);
    }

    #[test]
    fn detects_quality_filters_with_two_character_flags() {
        let filters = parse_quality_metrics(
            "Filters:\n TS psnr VV->V PSNR\n TS ssim VV->V SSIM\n .. scale V->V Scale",
        );
        assert_eq!(filters, ["ssim", "psnr"]);
    }

    #[test]
    fn parses_processor_name_from_registry_output() {
        let output = "ProcessorNameString    REG_SZ    Intel(R) Core(TM) Ultra 7 155H";
        assert_eq!(
            parse_processor_name(output).as_deref(),
            Some("Intel(R) Core(TM) Ultra 7 155H")
        );
        assert_eq!(parse_processor_name("other registry value"), None);
    }
}
