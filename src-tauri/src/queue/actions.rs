use crate::{models::JobStatus, state::AppState};

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
    let source_index = jobs
        .iter()
        .position(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    if jobs[source_index].status != JobStatus::Pending {
        return Err("Можна переміщувати лише завдання в очікуванні.".to_string());
    }
    let pending: Vec<usize> = jobs
        .iter()
        .enumerate()
        .filter_map(|(index, job)| (job.status == JobStatus::Pending).then_some(index))
        .collect();
    let target_index = target_index.min(pending.len().saturating_sub(1));
    let Some(&target_queue_index) = pending.get(target_index) else {
        return Ok(());
    };
    let job = jobs.remove(source_index);
    let insertion_index = target_queue_index.min(jobs.len());
    jobs.insert(insertion_index, job);
    drop(jobs);
    state.persist().await
}

pub async fn retry_job(state: &AppState, id: &str) -> Result<(), String> {
    let mut jobs = state.jobs.write().await;
    let job = jobs
        .iter_mut()
        .find(|job| job.id == id)
        .ok_or_else(|| "Завдання не знайдено.".to_string())?;
    if !matches!(
        job.status,
        JobStatus::Failed | JobStatus::Cancelled | JobStatus::Interrupted
    ) {
        return Err("Повторити можна лише перерване або невдале завдання.".to_string());
    }
    job.status = JobStatus::Pending;
    job.progress = 0.0;
    job.speed = None;
    job.eta_seconds = None;
    job.output_path = None;
    job.output_size = None;
    job.error = None;
    drop(jobs);
    state.persist().await
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
