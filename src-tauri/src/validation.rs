use crate::{media::MediaTools, models::VideoJob};
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
        let candidate = directory.join(format!("{label}.mp4"));
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
    if result.audio_tracks < job.metadata.audio_tracks {
        return Err("Перевірку не пройдено: втрачено аудіодоріжку.".to_string());
    }
    if result.subtitle_tracks < job.metadata.subtitle_tracks {
        return Err("Перевірку не пройдено: втрачено доріжку субтитрів.".to_string());
    }
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

fn rate_to_float(rate: &str) -> Option<f64> {
    let (numerator, denominator) = rate.split_once('/')?;
    let numerator = numerator.parse::<f64>().ok()?;
    let denominator = denominator.parse::<f64>().ok()?;
    (denominator != 0.0).then_some(numerator / denominator)
}
