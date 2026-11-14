use crate::{
    models::{AppSettings, JobStatus, VideoJob},
    state::AppState,
};

pub async fn move_job(state: &AppState, id: &str, direction: i32) -> Result<(), String> {
    let mut jobs = state.jobs.write().await;
    let index = jobs
        .iter()
        .position(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    let target = index as i32 + direction.signum();
    if target < 0 || target >= jobs.len() as i32 {
        return Ok(());
    }
    if jobs[index].status != JobStatus::Pending
        || jobs[target as usize].status != JobStatus::Pending
    {
        return Err("Можна змінювати порядок лише завдань в очікуванні.".to_string());
    }
    jobs.swap(index, target as usize);
    drop(jobs);
    state.persist().await
}

pub async fn reorder_job(state: &AppState, id: &str, target_index: usize) -> Result<(), String> {
    let mut jobs = state.jobs.write().await;
    if !reorder_pending_jobs(&mut jobs, id, target_index)? {
        return Ok(());
    }
    drop(jobs);
    state.persist().await
}

fn reorder_pending_jobs(
    jobs: &mut [VideoJob],
    id: &str,
    target_index: usize,
) -> Result<bool, String> {
    let mut pending_jobs: Vec<VideoJob> = jobs
        .iter()
        .filter(|job| job.status == JobStatus::Pending)
        .cloned()
        .collect();
    let source_index = pending_jobs
        .iter()
        .position(|job| job.id == id)
        .ok_or_else(|| {
            if jobs.iter().any(|job| job.id == id) {
                "Переміщувати можна лише завдання в очікуванні.".to_string()
            } else {
                "Завдання не знайдено.".to_string()
            }
        })?;
    let target_index = target_index.min(pending_jobs.len() - 1);
    if source_index == target_index {
        return Ok(false);
    }

    let moved_job = pending_jobs.remove(source_index);
    pending_jobs.insert(target_index, moved_job);
    for (job, reordered_job) in jobs
        .iter_mut()
        .filter(|job| job.status == JobStatus::Pending)
        .zip(pending_jobs)
    {
        *job = reordered_job;
    }
    Ok(true)
}

pub async fn retry_job(state: &AppState, id: &str) -> Result<(), String> {
    let settings = state.settings.read().await.clone();
    let mut jobs = state.jobs.write().await;
    let job = jobs
        .iter_mut()
        .find(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    if !reset_for_retry(job) {
        return Err("Повторити можна лише перерване або невдале завдання.".to_string());
    }
    apply_settings_to_job(job, &settings);
    drop(jobs);
    state.persist().await
}

pub async fn apply_settings_to_all_pending_jobs(
    state: &AppState,
    settings: &AppSettings,
) -> Result<usize, String> {
    let mut jobs = state.jobs.write().await;
    let previous_jobs = apply_settings_to_jobs(&mut jobs, settings);
    let count = previous_jobs.len();
    drop(jobs);

    if count == 0 {
        return Ok(0);
    }
    if let Err(error) = state.persist().await {
        let mut jobs = state.jobs.write().await;
        for previous in previous_jobs {
            if let Some(job) = jobs.iter_mut().find(|job| job.id == previous.id) {
                *job = previous;
            }
        }
        return Err(error);
    }
    Ok(count)
}

pub(super) fn reset_for_retry(job: &mut VideoJob) -> bool {
    if !matches!(
        job.status,
        JobStatus::Failed | JobStatus::Cancelled | JobStatus::Interrupted
    ) {
        return false;
    }
    job.status = JobStatus::Pending;
    job.progress = 0.0;
    job.speed = None;
    job.eta_seconds = None;
    job.output_path = None;
    job.output_size = None;
    job.error = None;
    job.result_warning = None;
    job.diagnostic_log = None;
    true
}

fn apply_settings_to_jobs(jobs: &mut [VideoJob], settings: &AppSettings) -> Vec<VideoJob> {
    let mut previous_jobs = Vec::new();
    for job in jobs
        .iter_mut()
        .filter(|job| job.status == JobStatus::Pending)
    {
        previous_jobs.push(job.clone());
        apply_settings_to_job(job, settings);
    }
    previous_jobs
}

pub(super) fn apply_settings_to_job(job: &mut VideoJob, settings: &AppSettings) {
    job.mode = settings.mode;
    job.quality = settings.quality;
    job.output_directory = settings.output_directory.clone();
    job.target_size_bytes = settings.target_size_bytes;
    job.custom_settings = settings.custom_settings;
}

pub async fn skip_job(state: &AppState, id: &str) -> Result<(), String> {
    let mut jobs = state.jobs.write().await;
    let job = jobs
        .iter_mut()
        .find(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    if job.status != JobStatus::Pending {
        return Err("Пропустити можна лише завдання в очікуванні.".to_string());
    }
    job.status = JobStatus::Skipped;
    drop(jobs);
    state.persist().await
}

pub async fn remove_job(state: &AppState, id: &str) -> Result<(), String> {
    let mut jobs = state.jobs.write().await;
    let index = jobs
        .iter()
        .position(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    if matches!(
        jobs[index].status,
        JobStatus::Analyzing | JobStatus::Preparing | JobStatus::Encoding | JobStatus::Validating
    ) {
        return Err("Спочатку скасуйте активне завдання.".to_string());
    }
    jobs.remove(index);
    drop(jobs);
    state.persist().await
}

pub async fn clear_completed(state: &AppState) -> Result<(), String> {
    state
        .jobs
        .write()
        .await
        .retain(|job| !matches!(job.status, JobStatus::Completed | JobStatus::Skipped));
    state.persist().await
}

#[cfg(test)]
mod tests {
    use super::{
        apply_settings_to_job, apply_settings_to_jobs, reorder_pending_jobs, reset_for_retry,
    };
    use crate::models::{
        AppSettings, CompressionMode, CustomDevice, CustomSettings, CustomVideoCodec, JobStatus,
        QualityProfile, VideoJob, VideoMetadata,
    };

    fn job(id: &str, status: JobStatus) -> VideoJob {
        VideoJob {
            id: id.to_string(),
            file_name: format!("{id}.mp4"),
            path: format!("C:/videos/{id}.mp4"),
            source_size: 1024,
            metadata: VideoMetadata {
                duration_seconds: 1.0,
                width: 1280,
                height: 720,
                frame_rate: "30/1".to_string(),
                codec: "h264".to_string(),
                bitrate: None,
                is_vfr: false,
                is_hdr: false,
                audio_tracks: 1,
                subtitle_tracks: 0,
                video_streams: 1,
                ..Default::default()
            },
            status,
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
    fn reorders_pending_jobs_without_moving_other_statuses() {
        let mut jobs = vec![
            job("a", JobStatus::Pending),
            job("finished", JobStatus::Completed),
            job("b", JobStatus::Pending),
            job("c", JobStatus::Pending),
        ];

        assert!(reorder_pending_jobs(&mut jobs, "a", 2).unwrap());
        assert_eq!(
            jobs.iter().map(|job| job.id.as_str()).collect::<Vec<_>>(),
            ["b", "finished", "c", "a"],
        );
    }

    #[test]
    fn automatic_settings_update_changes_all_pending_jobs_only() {
        let mut jobs = vec![
            job("pending", JobStatus::Pending),
            job("another-pending", JobStatus::Pending),
            job("active", JobStatus::Encoding),
        ];
        let settings = AppSettings {
            mode: CompressionMode::Maximum,
            quality: QualityProfile::Compact,
            output_directory: Some("C:/output".to_string()),
            target_size_bytes: Some(500_000_000),
            custom_settings: CustomSettings {
                codec: CustomVideoCodec::Hevc,
                device: CustomDevice::Cpu,
                ..Default::default()
            },
        };

        let previous = apply_settings_to_jobs(&mut jobs, &settings);

        assert_eq!(previous.len(), 2);
        assert!(matches!(jobs[0].mode, CompressionMode::Maximum));
        assert!(matches!(jobs[1].mode, CompressionMode::Maximum));
        assert_eq!(jobs[0].target_size_bytes, Some(500_000_000));
        assert!(matches!(
            jobs[0].custom_settings.codec,
            CustomVideoCodec::Hevc
        ));
        assert!(matches!(jobs[2].mode, CompressionMode::Smart));
    }

    #[test]
    fn retry_reinitializes_retryable_job_state() {
        let mut failed = job("failed", JobStatus::Failed);
        failed.progress = 0.8;
        failed.output_path = Some("C:/output/failed.mp4".to_string());
        let settings = AppSettings {
            mode: CompressionMode::Maximum,
            ..Default::default()
        };

        assert!(reset_for_retry(&mut failed));
        apply_settings_to_job(&mut failed, &settings);

        assert_eq!(failed.status, JobStatus::Pending);
        assert_eq!(failed.progress, 0.0);
        assert!(failed.output_path.is_none());
        assert!(matches!(failed.mode, CompressionMode::Maximum));
    }
}
