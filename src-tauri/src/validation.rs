use crate::{encoding::output_extension, media::MediaTools, models::VideoJob};
use std::path::{Path, PathBuf};

pub(crate) fn output_path(job: &VideoJob) -> Result<PathBuf, String> {
    let source = Path::new(&job.path);
    let directory = job
        .output_directory
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| source.parent().map(Path::to_path_buf))
        .ok_or_else(|| "Не вдалося визначити теку вихідного відео.".to_string())?;
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    for suffix in 0_u32..1000 {
        let label = if suffix == 0 {
            format!("{stem}_optimized")
        } else {
            format!("{stem}_optimized ({suffix})")
        };
        let candidate = directory.join(format!("{label}.{}", output_extension(job)));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Не вдалося підібрати вільну назву файлу.".to_string())
}

pub(crate) async fn validate_output(
    tools: &MediaTools,
    job: &VideoJob,
    temporary: &Path,
) -> Result<u64, String> {
    let metadata = tokio::fs::metadata(temporary)
        .await
        .map_err(|error| format!("Вихідний файл не створено: {error}"))?;
    if metadata.len() == 0 {
        return Err("Вихідний файл порожній.".to_string());
    }
    let result = tools.analyze(temporary).await?;
    let allowed_duration_difference = (job.metadata.duration_seconds * 0.01).max(0.5);
    if (result.duration_seconds - job.metadata.duration_seconds).abs() > allowed_duration_difference
    {
        return Err("Перевірку не пройдено: змінилася тривалість відео.".to_string());
    }
    if result.width != job.metadata.width || result.height != job.metadata.height {
        return Err("Перевірку не пройдено: змінилася роздільна здатність відео.".to_string());
    }
    if result.video_streams != job.metadata.video_streams {
        return Err("Перевірку не пройдено: змінилася кількість відеопотоків.".to_string());
    }
    if result.audio_tracks != job.metadata.audio_tracks {
        return Err("Перевірку не пройдено: втрачено аудіодоріжку.".to_string());
    }
    if result.subtitle_tracks != job.metadata.subtitle_tracks {
        return Err("Перевірку не пройдено: втрачено доріжку субтитрів.".to_string());
    }
    if result.attachment_streams != job.metadata.attachment_streams {
        return Err("Перевірку не пройдено: втрачено вкладений потік.".to_string());
    }
    if result.data_streams != job.metadata.data_streams {
        return Err("Перевірку не пройдено: змінилася кількість потоків даних.".to_string());
    }
    if result.attached_picture_streams != job.metadata.attached_picture_streams
        || result.unhandled_streams != job.metadata.unhandled_streams
    {
        return Err("Перевірку не пройдено: змінилися додаткові потоки.".to_string());
    }
    validate_color_metadata(job, &result)?;
    validate_rotation(job, &result)?;
    validate_bit_depth(job, &result)?;
    validate_audio_streams(job, &result)?;
    validate_subtitle_streams(job, &result)?;
    if !job.metadata.is_vfr {
        if let (Some(source_rate), Some(output_rate)) = (
            rate_to_float(&job.metadata.frame_rate),
            rate_to_float(&result.frame_rate),
        ) {
            if (source_rate - output_rate).abs() / source_rate.max(1.0) > 0.01 {
                return Err("Перевірку не пройдено: змінилася частота кадрів.".to_string());
            }
        }
    }
    Ok(metadata.len())
}

fn validate_color_metadata(
    job: &VideoJob,
    result: &crate::models::VideoMetadata,
) -> Result<(), String> {
    for (name, source, output) in [
        (
            "колірний простір",
            job.metadata.color_space.as_deref(),
            result.color_space.as_deref(),
        ),
        (
            "колірна характеристика",
            job.metadata.color_transfer.as_deref(),
            result.color_transfer.as_deref(),
        ),
        (
            "первинні кольори",
            job.metadata.color_primaries.as_deref(),
            result.color_primaries.as_deref(),
        ),
        (
            "колірний діапазон",
            job.metadata.color_range.as_deref(),
            result.color_range.as_deref(),
        ),
    ] {
        if source.is_some() && source != output {
            return Err(format!(
                "Перевірку не пройдено: змінилися властивості відео ({name})."
            ));
        }
    }
    Ok(())
}

fn validate_rotation(job: &VideoJob, result: &crate::models::VideoMetadata) -> Result<(), String> {
    if let Some(source) = job.metadata.rotation_degrees {
        let preserved = result.rotation_degrees.is_some_and(|output| {
            ((source - output + 180.0).rem_euclid(360.0) - 180.0).abs() < 1.0
        });
        if !preserved {
            return Err("Перевірку не пройдено: змінилася орієнтація відео.".to_string());
        }
    }
    Ok(())
}

fn validate_bit_depth(job: &VideoJob, result: &crate::models::VideoMetadata) -> Result<(), String> {
    let Some(source) = job.metadata.bit_depth else {
        return Ok(());
    };
    let Some(output) = result.bit_depth else {
        return Err("Перевірку не пройдено: не вдалося підтвердити розрядність відео.".to_string());
    };
    if output < source {
        return Err(format!(
            "Перевірку не пройдено: розрядність зменшилася з {source} до {output} біт."
        ));
    }
    Ok(())
}

fn validate_audio_streams(
    job: &VideoJob,
    result: &crate::models::VideoMetadata,
) -> Result<(), String> {
    for (index, (source, output)) in job
        .metadata
        .audio_streams
        .iter()
        .zip(&result.audio_streams)
        .enumerate()
    {
        if source.channels.is_some() && source.channels != output.channels {
            return Err(format!(
                "Перевірку не пройдено: змінилася кількість аудіоканалів у доріжці {}.",
                index + 1
            ));
        }
        if source.channel_layout.is_some() && source.channel_layout != output.channel_layout {
            return Err(format!(
                "Перевірку не пройдено: змінилася конфігурація аудіоканалів у доріжці {}.",
                index + 1
            ));
        }
        if source.sample_rate.is_some() && source.sample_rate != output.sample_rate {
            return Err(format!(
                "Перевірку не пройдено: змінилася частота дискретизації в аудіодоріжці {}.",
                index + 1
            ));
        }
    }
    Ok(())
}

fn validate_subtitle_streams(
    job: &VideoJob,
    result: &crate::models::VideoMetadata,
) -> Result<(), String> {
    for (index, (source, output)) in job
        .metadata
        .subtitle_streams
        .iter()
        .zip(&result.subtitle_streams)
        .enumerate()
    {
        let expected_codec = if output_extension(job) == "mp4" {
            "mov_text"
        } else {
            source.codec.as_str()
        };
        if output.codec != expected_codec {
            return Err(format!(
                "Перевірку не пройдено: змінився формат субтитрів у доріжці {}.",
                index + 1
            ));
        }
        if source.language.is_some() && source.language != output.language {
            return Err(format!(
                "Перевірку не пройдено: змінилася мова субтитрів у доріжці {}.",
                index + 1
            ));
        }
        if source.title.is_some() && source.title != output.title {
            return Err(format!(
                "Перевірку не пройдено: змінилася назва субтитрів у доріжці {}.",
                index + 1
            ));
        }
    }
    Ok(())
}

fn rate_to_float(rate: &str) -> Option<f64> {
    let (numerator, denominator) = rate.split_once('/')?;
    let numerator = numerator.parse::<f64>().ok()?;
    let denominator = denominator.parse::<f64>().ok()?;
    (denominator != 0.0).then_some(numerator / denominator)
}

#[cfg(test)]
mod tests {
    use super::{validate_bit_depth, validate_color_metadata, validate_rotation};
    use crate::models::{CompressionMode, QualityProfile, VideoJob, VideoMetadata};

    fn job(metadata: VideoMetadata) -> VideoJob {
        VideoJob {
            id: "job".to_string(),
            path: "source.mp4".to_string(),
            file_name: "source.mp4".to_string(),
            source_size: 1,
            metadata,
            status: crate::models::JobStatus::Pending,
            progress: 0.0,
            speed: None,
            eta_seconds: None,
            output_path: None,
            output_size: None,
            output_directory: None,
            mode: CompressionMode::Smart,
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

    #[test]
    fn rejects_lost_color_metadata() {
        let source = job(VideoMetadata {
            color_transfer: Some("bt709".to_string()),
            ..Default::default()
        });
        let output = VideoMetadata::default();

        assert!(validate_color_metadata(&source, &output).is_err());
    }

    #[test]
    fn accepts_equivalent_rotation_angles() {
        let source = job(VideoMetadata {
            rotation_degrees: Some(90.0),
            ..Default::default()
        });
        let output = VideoMetadata {
            rotation_degrees: Some(-270.0),
            ..Default::default()
        };

        assert!(validate_rotation(&source, &output).is_ok());
    }

    #[test]
    fn rejects_reduced_bit_depth() {
        let source = job(VideoMetadata {
            bit_depth: Some(10),
            ..Default::default()
        });
        let output = VideoMetadata {
            bit_depth: Some(8),
            ..Default::default()
        };

        assert!(validate_bit_depth(&source, &output).is_err());
    }
}
