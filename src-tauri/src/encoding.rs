use crate::{
    media::MediaTools,
    models::{
        CompressionMode, CustomAudioCodec, CustomDevice, CustomPreset, CustomVideoCodec,
        OutputContainer, QualityProfile, VideoJob, VideoMetadata,
    },
};
use std::path::Path;

#[derive(Clone)]
pub(crate) struct EncoderChoice {
    pub name: String,
    pub software_fallback: Option<String>,
}

pub(crate) fn select_encoder(job: &VideoJob, tools: &MediaTools) -> Option<EncoderChoice> {
    let available = |name: &str| {
        tools
            .runtime
            .encoders
            .iter()
            .any(|item| item.name == name && item.available)
    };
    let candidates: Vec<(&str, Option<&str>)> = match job.mode {
        CompressionMode::Custom => {
            let (hardware, software) = match job.custom_settings.codec {
                CustomVideoCodec::H264 => ("h264_qsv", "libx264"),
                CustomVideoCodec::Hevc => ("hevc_qsv", "libx265"),
                CustomVideoCodec::Av1 => ("av1_qsv", "libsvtav1"),
            };
            match job.custom_settings.device {
                CustomDevice::Cpu => vec![(software, None)],
                CustomDevice::Qsv => vec![(hardware, Some(software))],
                CustomDevice::Auto => vec![(hardware, Some(software)), (software, None)],
            }
        }
        CompressionMode::Maximum => vec![
            ("libsvtav1", None),
            ("libx265", None),
            ("libx264", None),
            ("av1_qsv", Some("libsvtav1")),
            ("hevc_qsv", Some("libx265")),
            ("h264_qsv", Some("libx264")),
        ],
        CompressionMode::Fast => vec![
            ("h264_qsv", Some("libx264")),
            ("hevc_qsv", Some("libx265")),
            ("av1_qsv", Some("libsvtav1")),
            ("libx264", None),
            ("libx265", None),
            ("libsvtav1", None),
        ],
        CompressionMode::Smart => vec![
            ("hevc_qsv", Some("libx265")),
            ("h264_qsv", Some("libx264")),
            ("libx265", None),
            ("libx264", None),
            ("libsvtav1", None),
            ("av1_qsv", Some("libsvtav1")),
        ],
    };
    candidates
        .iter()
        .find(|(name, _)| available(name))
        .map(|(name, fallback)| EncoderChoice {
            name: (*name).to_string(),
            software_fallback: fallback.map(str::to_string),
        })
}

pub(crate) fn output_extension(job: &VideoJob) -> &'static str {
    if matches!(job.mode, CompressionMode::Custom) {
        match job.custom_settings.container {
            OutputContainer::Mp4 => return "mp4",
            OutputContainer::Mkv => return "mkv",
            OutputContainer::Auto => {}
        }
    }

    if requires_matroska(&job.metadata) {
        "mkv"
    } else {
        "mp4"
    }
}

pub(crate) fn requires_matroska(metadata: &VideoMetadata) -> bool {
    metadata.attachment_streams > 0
        || (metadata.subtitle_tracks > 0
            && (metadata.subtitle_streams.is_empty()
                || metadata.subtitle_streams.iter().any(|stream| {
                    !matches!(stream.codec.as_str(), "subrip" | "mov_text" | "webvtt")
                })))
}

pub(crate) fn audio_codec_for_job(job: &VideoJob) -> &'static str {
    if matches!(job.mode, CompressionMode::Custom)
        && matches!(job.custom_settings.audio_codec, CustomAudioCodec::Aac)
    {
        return "aac";
    }
    if matches!(job.mode, CompressionMode::Smart) {
        let source_bitrate = job
            .metadata
            .audio_streams
            .first()
            .and_then(|stream| stream.bitrate);
        let reencode = source_bitrate.map(|bits| bits > 160_000).unwrap_or(true);
        if reencode {
            return "aac";
        }
    }
    "copy"
}

pub(crate) struct EncodingPlan<'a> {
    pub encoder: &'a str,
    pub supported_options: &'a [String],
    pub target_video_bitrate: Option<u64>,
    pub pass: Option<u8>,
    pub pass_logfile: Option<&'a Path>,
    pub audio_codec: &'a str,
    pub include_audio: bool,
    pub start_seconds: Option<f64>,
    pub duration_seconds: Option<f64>,
    pub temporary: &'a Path,
}

pub(crate) fn encoding_args(job: &VideoJob, plan: EncodingPlan<'_>) -> Vec<String> {
    let EncodingPlan {
        encoder,
        supported_options,
        target_video_bitrate,
        pass,
        pass_logfile,
        audio_codec,
        include_audio,
        start_seconds,
        duration_seconds,
        temporary,
    } = plan;
    let mut args = vec![
        "-hide_banner".into(),
        "-y".into(),
        "-nostats".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-noautorotate".into(),
    ];
    if let Some(start_seconds) = start_seconds {
        args.extend(["-ss".into(), format!("{:.3}", start_seconds.max(0.0))]);
    }
    args.extend(["-i".into(), job.path.clone()]);
    if let Some(duration_seconds) = duration_seconds {
        args.extend(["-t".into(), format!("{:.3}", duration_seconds.max(0.1))]);
    }
    args.extend([
        "-map".into(),
        format!("0:{}", job.metadata.video_stream_index),
    ]);
    if include_audio {
        args.extend(["-map".into(), "0:a?".into()]);
    }
    if job.metadata.subtitle_tracks > 0 {
        args.extend(["-map".into(), "0:s?".into()]);
    }
    args.extend([
        "-map_metadata".into(),
        "0".into(),
        "-map_chapters".into(),
        "0".into(),
        "-c:v".into(),
        encoder.into(),
    ]);
    if job.metadata.attachment_streams > 0 {
        args.extend(["-map".into(), "0:t?".into(), "-c:t".into(), "copy".into()]);
    }
    if let Some(video_bitrate) = target_video_bitrate {
        args.extend(["-b:v".into(), video_bitrate.to_string()]);
        push_encoder_option(
            &mut args,
            supported_options,
            "maxrate",
            &(video_bitrate.saturating_mul(115) / 100).to_string(),
        );
        push_encoder_option(
            &mut args,
            supported_options,
            "bufsize",
            &video_bitrate.saturating_mul(2).to_string(),
        );
    } else if encoder.ends_with("_qsv") {
        let quality_option = if supports(supported_options, "global_quality") {
            "global_quality"
        } else {
            "qp"
        };
        push_encoder_option(
            &mut args,
            supported_options,
            quality_option,
            &qsv_quality(&job.quality).to_string(),
        );
    } else if encoder == "libsvtav1" {
        push_encoder_option(
            &mut args,
            supported_options,
            "crf",
            &svt_quality(&job.quality).to_string(),
        );
    } else {
        push_encoder_option(
            &mut args,
            supported_options,
            "crf",
            &software_quality(encoder, &job.quality).to_string(),
        );
    }
    push_encoder_option(
        &mut args,
        supported_options,
        "preset",
        encoder_preset(job, encoder),
    );
    args.extend(["-fps_mode".into(), "passthrough".into()]);
    push_color_option(
        &mut args,
        "-colorspace",
        job.metadata.color_space.as_deref(),
    );
    push_color_option(
        &mut args,
        "-color_trc",
        job.metadata.color_transfer.as_deref(),
    );
    push_color_option(
        &mut args,
        "-color_primaries",
        job.metadata.color_primaries.as_deref(),
    );
    push_color_option(
        &mut args,
        "-color_range",
        job.metadata.color_range.as_deref(),
    );
    if include_audio {
        args.extend(["-c:a".into(), audio_codec.into()]);
        if audio_codec == "aac" {
            let bitrate = if matches!(job.mode, CompressionMode::Custom) {
                job.custom_settings.audio_bitrate_kbps
            } else if matches!(job.mode, CompressionMode::Smart) {
                128
            } else {
                192
            };
            args.extend(["-b:a".into(), format!("{bitrate}k")]);
        }
    }
    if job.metadata.subtitle_tracks > 0 && output_extension(job) == "mkv" {
        args.extend(["-c:s".into(), "copy".into()]);
    } else if job.metadata.subtitle_tracks > 0 {
        args.extend(["-c:s".into(), "mov_text".into()]);
    }
    if let Some(pass) = pass {
        args.extend(["-pass".into(), pass.to_string()]);
        if let Some(pass_logfile) = pass_logfile {
            args.extend([
                "-passlogfile".into(),
                pass_logfile.to_string_lossy().into_owned(),
            ]);
        }
        if pass == 1 {
            args.extend([
                "-an".into(),
                "-sn".into(),
                "-dn".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ]);
            return args;
        }
    }
    if pass.is_none() && output_extension(job) == "mp4" {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.push(temporary.to_string_lossy().into_owned());
    args
}

pub(crate) fn target_video_bitrate(job: &VideoJob) -> Result<Option<u64>, String> {
    let Some(target_size_bytes) = job.target_size_bytes else {
        return Ok(if matches!(job.mode, CompressionMode::Custom) {
            job.custom_settings
                .video_bitrate_kbps
                .map(|bitrate| u64::from(bitrate) * 1_000)
        } else {
            None
        });
    };
    let duration = job.metadata.duration_seconds;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Неможливо розрахувати цільовий бітрейт без тривалості відео.".to_string());
    }

    let audio_bitrate = if matches!(job.mode, CompressionMode::Custom)
        && matches!(job.custom_settings.audio_codec, CustomAudioCodec::Aac)
    {
        u64::from(job.metadata.audio_tracks)
            .saturating_mul(u64::from(job.custom_settings.audio_bitrate_kbps) * 1_000)
    } else if matches!(job.mode, CompressionMode::Smart) {
        let per_stream = |stream: &crate::models::AudioStreamInfo| {
            stream.bitrate.unwrap_or(128_000).min(128_000)
        };
        if job.metadata.audio_streams.is_empty() {
            u64::from(job.metadata.audio_tracks).saturating_mul(128_000)
        } else {
            job.metadata
                .audio_streams
                .iter()
                .fold(0_u64, |total, stream| {
                    total.saturating_add(per_stream(stream))
                })
        }
    } else if job.metadata.audio_streams.is_empty() {
        u64::from(job.metadata.audio_tracks).saturating_mul(192_000)
    } else {
        job.metadata
            .audio_streams
            .iter()
            .fold(0_u64, |total, stream| {
                total.saturating_add(stream.bitrate.unwrap_or(192_000))
            })
    };
    let total_bitrate = (target_size_bytes as f64 * 8.0 / duration * 0.98) as u64;
    let video_bitrate = total_bitrate.saturating_sub(audio_bitrate);
    if video_bitrate < 50_000 {
        return Err(
            "Цільовий розмір замалий для збереження аудіо й кодування відео. \
             Збільште цільовий розмір."
                .to_string(),
        );
    }

    Ok(Some(video_bitrate))
}

fn encoder_preset(job: &VideoJob, encoder: &str) -> &'static str {
    if matches!(job.mode, CompressionMode::Custom) {
        return match (job.custom_settings.preset, encoder) {
            (CustomPreset::Fast, name) if name.ends_with("_qsv") => "fast",
            (CustomPreset::Balanced, name) if name.ends_with("_qsv") => "medium",
            (CustomPreset::Quality, name) if name.ends_with("_qsv") => "slow",
            (CustomPreset::Fast, "libsvtav1") => "10",
            (CustomPreset::Balanced, "libsvtav1") => "8",
            (CustomPreset::Quality, "libsvtav1") => "6",
            (CustomPreset::Fast, _) => "veryfast",
            (CustomPreset::Balanced, _) => "medium",
            (CustomPreset::Quality, _) => "slow",
        };
    }

    match (job.mode, encoder) {
        (CompressionMode::Fast, name) if name.ends_with("_qsv") => "fast",
        (_, name) if name.ends_with("_qsv") => "medium",
        (CompressionMode::Fast, "libsvtav1") => "10",
        (CompressionMode::Maximum, "libsvtav1") => "6",
        (CompressionMode::Smart, "libsvtav1") => "6",
        (_, "libsvtav1") => "8",
        (CompressionMode::Fast, _) => "veryfast",
        (CompressionMode::Maximum, _) => "slow",
        (CompressionMode::Smart, "libx265") => "medium",
        (CompressionMode::Smart | CompressionMode::Custom, _) => "medium",
    }
}

fn supports(options: &[String], option: &str) -> bool {
    options.iter().any(|supported| supported == option)
}

fn push_encoder_option(args: &mut Vec<String>, options: &[String], option: &str, value: &str) {
    if supports(options, option) {
        args.extend([format!("-{option}"), value.to_string()]);
    }
}

fn push_color_option(args: &mut Vec<String>, option: &str, value: Option<&str>) {
    if let Some(value) = value {
        args.extend([option.to_string(), value.to_string()]);
    }
}

fn qsv_quality(quality: &QualityProfile) -> u8 {
    match quality {
        QualityProfile::NearOriginal => 18,
        QualityProfile::High => 21,
        QualityProfile::Balanced => 24,
        QualityProfile::Compact => 27,
    }
}

fn software_quality(encoder: &str, quality: &QualityProfile) -> u8 {
    match (encoder, quality) {
        ("libx265", QualityProfile::NearOriginal) => 19,
        ("libx265", QualityProfile::High) => 22,
        ("libx265", QualityProfile::Balanced) => 25,
        ("libx265", QualityProfile::Compact) => 28,
        (_, QualityProfile::NearOriginal) => 17,
        (_, QualityProfile::High) => 19,
        (_, QualityProfile::Balanced) => 22,
        (_, QualityProfile::Compact) => 25,
    }
}

fn svt_quality(quality: &QualityProfile) -> u8 {
    match quality {
        QualityProfile::NearOriginal => 24,
        QualityProfile::High => 27,
        QualityProfile::Balanced => 30,
        QualityProfile::Compact => 33,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        audio_codec_for_job, encoder_preset, encoding_args, output_extension, qsv_quality,
        requires_matroska, select_encoder, software_quality, svt_quality, target_video_bitrate,
        EncodingPlan,
    };
    use crate::{
        media::MediaTools,
        models::{
            AudioStreamInfo, CompressionMode, CustomAudioCodec, CustomDevice, CustomPreset,
            CustomVideoCodec, EncoderAvailability, OutputContainer, QualityProfile, RuntimeInfo,
            SubtitleStreamInfo, VideoJob, VideoMetadata,
        },
    };
    use std::path::{Path, PathBuf};

    fn job(mode: CompressionMode, subtitle_tracks: u32) -> VideoJob {
        VideoJob {
            id: "job".to_string(),
            path: "C:/videos/source.mp4".to_string(),
            file_name: "source.mp4".to_string(),
            source_size: 1_000,
            metadata: VideoMetadata {
                duration_seconds: 60.0,
                subtitle_tracks,
                video_streams: 1,
                ..Default::default()
            },
            status: crate::models::JobStatus::Pending,
            progress: 0.0,
            speed: None,
            eta_seconds: None,
            output_path: None,
            output_size: None,
            output_directory: None,
            mode,
            quality: QualityProfile::Balanced,
            custom_settings: Default::default(),
            encoder: None,
            error: None,
            created_at: 0,
            elapsed_seconds: None,
            target_size_bytes: None,
            result_warning: None,
            diagnostic_log: None,
        }
    }

    fn tools(encoders: &[(&str, bool, bool)]) -> MediaTools {
        MediaTools {
            ffmpeg: Some(PathBuf::from("ffmpeg")),
            ffprobe: Some(PathBuf::from("ffprobe")),
            runtime: RuntimeInfo {
                ffmpeg_path: Some("ffmpeg".to_string()),
                ffprobe_path: Some("ffprobe".to_string()),
                ffmpeg_version: None,
                quality_metrics: vec![],
                logical_processors: 1,
                processor_name: None,
                encoders: encoders
                    .iter()
                    .map(|(name, available, hardware)| EncoderAvailability {
                        name: (*name).to_string(),
                        available: *available,
                        hardware: *hardware,
                        supported_options: vec![],
                    })
                    .collect(),
                qsv_available: encoders
                    .iter()
                    .any(|(_, available, hardware)| *available && *hardware),
                ready: true,
            },
        }
    }

    #[test]
    fn quality_values_are_codec_specific() {
        assert_eq!(qsv_quality(&QualityProfile::High), 21);
        assert_eq!(software_quality("libx264", &QualityProfile::High), 19);
        assert_eq!(software_quality("libx265", &QualityProfile::High), 22);
        assert_eq!(svt_quality(&QualityProfile::High), 27);
    }

    #[test]
    fn quality_profiles_apply_increasing_compression_strength() {
        let profiles = [
            QualityProfile::NearOriginal,
            QualityProfile::High,
            QualityProfile::Balanced,
            QualityProfile::Compact,
        ];
        let values = [
            profiles.map(|profile| software_quality("libx264", &profile)),
            profiles.map(|profile| software_quality("libx265", &profile)),
            profiles.map(|profile| qsv_quality(&profile)),
            profiles.map(|profile| svt_quality(&profile)),
        ];

        for codec_values in values {
            assert!(codec_values.windows(2).all(|pair| pair[0] < pair[1]));
        }
    }

    #[test]
    fn encoder_selection_uses_per_encoder_qsv_test_results() {
        let tools = tools(&[
            ("hevc_qsv", false, true),
            ("av1_qsv", true, true),
            ("libsvtav1", false, false),
        ]);
        let choice = select_encoder(&job(CompressionMode::Smart, 0), &tools).unwrap();

        assert_eq!(choice.name, "av1_qsv");
    }

    #[test]
    fn smart_prefers_hardware_hevc_when_available() {
        let tools = tools(&[
            ("hevc_qsv", true, true),
            ("libx265", true, false),
            ("libsvtav1", true, false),
        ]);

        let choice = select_encoder(&job(CompressionMode::Smart, 0), &tools).unwrap();

        assert_eq!(choice.name, "hevc_qsv");
        assert_eq!(choice.software_fallback.as_deref(), Some("libx265"));
    }

    #[test]
    fn fast_and_maximum_modes_have_distinct_encoder_priorities() {
        let tools = tools(&[
            ("h264_qsv", true, true),
            ("hevc_qsv", true, true),
            ("libsvtav1", true, false),
        ]);

        assert_eq!(
            select_encoder(&job(CompressionMode::Fast, 0), &tools)
                .unwrap()
                .name,
            "h264_qsv"
        );
        assert_eq!(
            select_encoder(&job(CompressionMode::Maximum, 0), &tools)
                .unwrap()
                .name,
            "libsvtav1"
        );
    }

    #[test]
    fn custom_encoder_selection_respects_codec_and_device() {
        let tools = tools(&[
            ("h264_qsv", true, true),
            ("libx264", true, false),
            ("hevc_qsv", false, true),
            ("libx265", true, false),
            ("av1_qsv", true, true),
            ("libsvtav1", true, false),
        ]);
        let mut custom = job(CompressionMode::Custom, 0);
        custom.custom_settings.codec = CustomVideoCodec::Hevc;
        custom.custom_settings.device = CustomDevice::Cpu;

        let cpu = select_encoder(&custom, &tools).unwrap();
        assert_eq!(cpu.name, "libx265");
        assert_eq!(cpu.software_fallback, None);

        custom.custom_settings.device = CustomDevice::Qsv;
        assert!(select_encoder(&custom, &tools).is_none());

        custom.custom_settings.codec = CustomVideoCodec::H264;
        let qsv = select_encoder(&custom, &tools).unwrap();
        assert_eq!(qsv.name, "h264_qsv");
        assert_eq!(qsv.software_fallback.as_deref(), Some("libx264"));
    }

    #[test]
    fn custom_codec_and_device_matrix_selects_the_requested_encoder() {
        let tools = tools(&[
            ("h264_qsv", true, true),
            ("libx264", true, false),
            ("hevc_qsv", true, true),
            ("libx265", true, false),
            ("av1_qsv", true, true),
            ("libsvtav1", true, false),
        ]);
        let codecs = [
            (CustomVideoCodec::H264, "libx264", "h264_qsv"),
            (CustomVideoCodec::Hevc, "libx265", "hevc_qsv"),
            (CustomVideoCodec::Av1, "libsvtav1", "av1_qsv"),
        ];

        for (codec, cpu_encoder, qsv_encoder) in codecs {
            let mut custom = job(CompressionMode::Custom, 0);
            custom.custom_settings.codec = codec;

            custom.custom_settings.device = CustomDevice::Cpu;
            assert_eq!(select_encoder(&custom, &tools).unwrap().name, cpu_encoder);

            custom.custom_settings.device = CustomDevice::Qsv;
            assert_eq!(select_encoder(&custom, &tools).unwrap().name, qsv_encoder);

            custom.custom_settings.device = CustomDevice::Auto;
            assert_eq!(select_encoder(&custom, &tools).unwrap().name, qsv_encoder);
        }
    }

    #[test]
    fn subtitle_jobs_use_matroska_to_keep_original_subtitle_streams() {
        assert_eq!(output_extension(&job(CompressionMode::Smart, 1)), "mkv");
        assert_eq!(output_extension(&job(CompressionMode::Smart, 0)), "mp4");
    }

    #[test]
    fn custom_container_is_applied_and_incompatible_streams_require_matroska() {
        let mut custom = job(CompressionMode::Custom, 0);
        custom.custom_settings.container = OutputContainer::Mp4;
        assert_eq!(output_extension(&custom), "mp4");

        custom.custom_settings.container = OutputContainer::Mkv;
        assert_eq!(output_extension(&custom), "mkv");

        custom.metadata.attachment_streams = 1;
        assert!(requires_matroska(&custom.metadata));
    }

    #[test]
    fn text_subtitles_can_use_mp4_while_bitmap_subtitles_use_matroska() {
        let mut text_job = job(CompressionMode::Smart, 1);
        text_job.metadata.subtitle_streams = vec![SubtitleStreamInfo {
            codec: "subrip".to_string(),
            ..Default::default()
        }];
        let mut bitmap_job = text_job.clone();
        bitmap_job.metadata.subtitle_streams[0].codec = "hdmv_pgs_subtitle".to_string();

        assert_eq!(output_extension(&text_job), "mp4");
        assert_eq!(output_extension(&bitmap_job), "mkv");
    }

    #[test]
    fn encoder_arguments_only_use_detected_options_and_mode_presets() {
        let options = vec!["global_quality".to_string(), "preset".to_string()];
        let args = encoding_args(
            &job(CompressionMode::Fast, 0),
            EncodingPlan {
                encoder: "h264_qsv",
                supported_options: &options,
                target_video_bitrate: None,
                pass: None,
                pass_logfile: None,
                audio_codec: "copy",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mp4"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-preset" && pair[1] == "fast"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-global_quality" && pair[1] == "24"));
        assert!(!args.iter().any(|arg| arg == "-crf"));
    }

    #[test]
    fn smart_uses_balanced_hevc_quality_and_medium_preset() {
        let options = ["crf".to_string(), "preset".to_string()];
        let args = encoding_args(
            &job(CompressionMode::Smart, 0),
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: None,
                pass: None,
                pass_logfile: None,
                audio_codec: "copy",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mp4"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-crf" && pair[1] == "25"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-preset" && pair[1] == "medium"));
    }

    #[test]
    fn smart_aac_uses_128_kbps_to_match_streaming_quality() {
        let options = ["crf".to_string(), "preset".to_string()];
        let args = encoding_args(
            &job(CompressionMode::Smart, 0),
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: None,
                pass: None,
                pass_logfile: None,
                audio_codec: "aac",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mp4"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-b:a" && pair[1] == "128k"));
    }

    #[test]
    fn smart_reencodes_high_bitrate_audio_and_copies_low_bitrate() {
        let mut high = job(CompressionMode::Smart, 0);
        high.metadata.audio_streams = vec![AudioStreamInfo {
            bitrate: Some(256_000),
            ..Default::default()
        }];
        assert_eq!(audio_codec_for_job(&high), "aac");

        let mut low = job(CompressionMode::Smart, 0);
        low.metadata.audio_streams = vec![AudioStreamInfo {
            bitrate: Some(128_000),
            ..Default::default()
        }];
        assert_eq!(audio_codec_for_job(&low), "copy");

        let unknown = job(CompressionMode::Smart, 0);
        assert_eq!(audio_codec_for_job(&unknown), "aac");
    }

    #[test]
    fn non_smart_modes_copy_audio_by_default() {
        assert_eq!(audio_codec_for_job(&job(CompressionMode::Fast, 0)), "copy");
        assert_eq!(
            audio_codec_for_job(&job(CompressionMode::Maximum, 0)),
            "copy"
        );
    }

    #[test]
    fn custom_preset_audio_codec_and_audio_bitrate_are_applied() {
        let mut custom = job(CompressionMode::Custom, 0);
        custom.custom_settings.preset = CustomPreset::Quality;
        custom.custom_settings.audio_codec = CustomAudioCodec::Aac;
        custom.custom_settings.audio_bitrate_kbps = 256;
        let options = ["crf".to_string(), "preset".to_string()];
        let args = encoding_args(
            &custom,
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: None,
                pass: None,
                pass_logfile: None,
                audio_codec: "aac",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mkv"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-preset" && pair[1] == "slow"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-b:a" && pair[1] == "256k"));
    }

    #[test]
    fn custom_presets_map_to_each_encoder_familys_speed_scale() {
        let cases = [
            (CustomPreset::Fast, "veryfast", "fast", "10"),
            (CustomPreset::Balanced, "medium", "medium", "8"),
            (CustomPreset::Quality, "slow", "slow", "6"),
        ];

        for (preset, cpu, qsv, av1) in cases {
            let mut custom = job(CompressionMode::Custom, 0);
            custom.custom_settings.preset = preset;
            assert_eq!(encoder_preset(&custom, "libx264"), cpu);
            assert_eq!(encoder_preset(&custom, "libx265"), cpu);
            assert_eq!(encoder_preset(&custom, "h264_qsv"), qsv);
            assert_eq!(encoder_preset(&custom, "hevc_qsv"), qsv);
            assert_eq!(encoder_preset(&custom, "libsvtav1"), av1);
        }
    }

    #[test]
    fn custom_manual_video_bitrate_replaces_quality_based_rate_control() {
        let mut custom = job(CompressionMode::Custom, 0);
        custom.custom_settings.video_bitrate_kbps = Some(2_500);
        let options = ["b".to_string(), "preset".to_string(), "crf".to_string()];
        let args = encoding_args(
            &custom,
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: target_video_bitrate(&custom).unwrap(),
                pass: None,
                pass_logfile: None,
                audio_codec: "copy",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mkv"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-b:v" && pair[1] == "2500000"));
        assert!(!args.iter().any(|argument| argument == "-crf"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c:a" && pair[1] == "copy"));
    }

    #[test]
    fn subtitle_streams_are_copied_and_skip_mp4_only_options() {
        let options = ["crf".to_string(), "preset".to_string()];
        let args = encoding_args(
            &job(CompressionMode::Smart, 1),
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: None,
                pass: None,
                pass_logfile: None,
                audio_codec: "copy",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mkv"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c:s" && pair[1] == "copy"));
        assert!(!args.iter().any(|arg| arg == "0:t?"));
        assert!(!args.iter().any(|arg| arg == "-movflags"));
    }

    #[test]
    fn target_size_arguments_use_bitrate_and_two_pass_null_output() {
        let options = [
            "b".to_string(),
            "maxrate".to_string(),
            "bufsize".to_string(),
        ];
        let args = encoding_args(
            &job(CompressionMode::Maximum, 0),
            EncodingPlan {
                encoder: "libx265",
                supported_options: &options,
                target_video_bitrate: Some(1_000_000),
                pass: Some(1),
                pass_logfile: Some(Path::new("pass.log")),
                audio_codec: "copy",
                include_audio: true,
                start_seconds: None,
                duration_seconds: None,
                temporary: Path::new("output.mp4"),
            },
        );

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-b:v" && pair[1] == "1000000"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-pass" && pair[1] == "1"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-f" && pair[1] == "null"));
        assert_eq!(args.last().map(String::as_str), Some("-"));
        assert!(!args.iter().any(|arg| arg == "-movflags"));
    }

    #[test]
    fn target_bitrate_reserves_audio_and_container_overhead() {
        let mut job = job(CompressionMode::Smart, 0);
        job.target_size_bytes = Some(10_000_000);
        job.metadata.audio_tracks = 1;
        job.metadata.audio_streams = vec![AudioStreamInfo {
            bitrate: Some(128_000),
            ..Default::default()
        }];

        let bitrate = target_video_bitrate(&job).unwrap().unwrap();

        assert!(bitrate > 1_100_000);
        assert!(bitrate < 1_200_000);
    }

    #[test]
    fn custom_video_bitrate_is_used_when_target_size_is_not_set() {
        let mut job = job(CompressionMode::Custom, 0);
        job.custom_settings.video_bitrate_kbps = Some(2_500);

        assert_eq!(target_video_bitrate(&job).unwrap(), Some(2_500_000));
    }

    #[test]
    fn custom_target_size_takes_precedence_over_manual_video_bitrate() {
        let mut job = job(CompressionMode::Custom, 0);
        job.custom_settings.video_bitrate_kbps = Some(2_500);
        job.target_size_bytes = Some(10_000_000);
        job.metadata.audio_tracks = 1;
        job.metadata.audio_streams = vec![AudioStreamInfo {
            bitrate: Some(128_000),
            ..Default::default()
        }];

        let target_bitrate = target_video_bitrate(&job).unwrap().unwrap();

        assert!(target_bitrate < 2_500_000);
        assert!(target_bitrate > 1_000_000);
    }

    #[test]
    fn target_bitrate_rejects_size_that_cannot_reserve_audio() {
        let mut job = job(CompressionMode::Smart, 0);
        job.target_size_bytes = Some(500_000);
        job.metadata.audio_tracks = 1;

        assert!(target_video_bitrate(&job).is_err());
    }
}
