use crate::{
    media::MediaTools,
    models::{CompressionMode, QualityProfile, VideoJob},
};
use std::path::Path;

#[derive(Clone)]
pub(crate) struct EncoderChoice {
    pub name: String,
    pub software_fallback: Option<String>,
}

pub(crate) fn select_encoder(job: &VideoJob, tools: &MediaTools) -> Option<EncoderChoice> {
    let available = |name: &str| {
        tools.runtime.encoders.iter().any(|item| {
            item.name == name && item.available && (!item.hardware || tools.runtime.qsv_available)
        })
    };
    let candidates: &[(&str, Option<&str>)] = match job.mode {
        CompressionMode::Maximum => &[
            ("libsvtav1", None),
            ("libx265", None),
            ("av1_qsv", Some("libsvtav1")),
            ("hevc_qsv", Some("libx265")),
        ],
        CompressionMode::Smart | CompressionMode::Fast | CompressionMode::Custom => &[
            ("hevc_qsv", Some("libx265")),
            ("av1_qsv", Some("libsvtav1")),
            ("h264_qsv", Some("libx264")),
            ("libx265", None),
            ("libx264", None),
            ("libsvtav1", None),
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

pub(crate) fn encoding_args(
    job: &VideoJob,
    encoder: &str,
    audio_codec: &str,
    temporary: &Path,
) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".into(),
        "-y".into(),
        "-nostats".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-noautorotate".into(),
        "-i".into(),
        job.path.clone(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a?".into(),
        "-map".into(),
        "0:s?".into(),
        "-map_metadata".into(),
        "0".into(),
        "-map_chapters".into(),
        "0".into(),
        "-c:v".into(),
        encoder.into(),
    ];
    if encoder.ends_with("_qsv") {
        args.extend([
            "-global_quality".into(),
            qsv_quality(&job.quality).to_string(),
        ]);
        args.extend(["-preset".into(), "medium".into()]);
    } else if encoder == "libsvtav1" {
        args.extend(["-crf".into(), svt_quality(&job.quality).to_string()]);
        let preset = if matches!(job.mode, CompressionMode::Fast) {
            "10"
        } else {
            "8"
        };
        args.extend(["-preset".into(), preset.into()]);
    } else {
        args.extend([
            "-crf".into(),
            software_quality(encoder, &job.quality).to_string(),
        ]);
        let preset = if matches!(job.mode, CompressionMode::Maximum) {
            "slow"
        } else {
            "medium"
        };
        args.extend(["-preset".into(), preset.into()]);
    }
    args.extend([
        "-fps_mode".into(),
        "passthrough".into(),
        "-c:a".into(),
        audio_codec.into(),
    ]);
    if audio_codec == "aac" {
        args.extend(["-b:a".into(), "192k".into()]);
    }
    args.extend([
        "-c:s".into(),
        "mov_text".into(),
        "-movflags".into(),
        "+faststart".into(),
        temporary.to_string_lossy().into_owned(),
    ]);
    args
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
        ("libx265", QualityProfile::High) => 21,
        ("libx265", QualityProfile::Balanced) => 24,
        ("libx265", QualityProfile::Compact) => 27,
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
    use super::{qsv_quality, software_quality, svt_quality};
    use crate::models::QualityProfile;

    #[test]
    fn quality_values_are_codec_specific() {
        assert_eq!(qsv_quality(&QualityProfile::High), 21);
        assert_eq!(software_quality("libx264", &QualityProfile::High), 19);
        assert_eq!(software_quality("libx265", &QualityProfile::High), 21);
        assert_eq!(svt_quality(&QualityProfile::High), 27);
    }
}
