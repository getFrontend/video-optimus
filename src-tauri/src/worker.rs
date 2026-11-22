use crate::{
    encoding::{output_extension, select_encoder},
    ffmpeg_process::encode_with_fallback,
    models::{JobStatus, VideoJob},
    state::AppState,
    validation::{output_path, validate_output},
};
use std::{collections::HashSet, sync::Arc, time::Instant};
use tauri::AppHandle;
use tokio::sync::Notify;
use uuid::Uuid;

pub async fn run_queue(app: AppHandle, state: AppState, selected_job_ids: Option<HashSet<String>>) {
    loop {
        if state
            .stop_requested
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            break;
        }
        let next = state
            .jobs
            .read()
            .await
            .iter()
            .find(|job| should_process_job(&job.status, &job.id, selected_job_ids.as_ref()))
            .cloned();
        let Some(job) = next else { break };
        let started = Instant::now();
        let tools = state.tools.read().await.clone();
        if job.metadata.data_streams > 0 {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some(
                    "Відео містить потоки даних, які поточний експорт не підтримує. \
                     Вихідний файл не створено, оригінал збережено."
                        .to_string(),
                ),
            )
            .await;
            continue;
        }
        if job.metadata.video_streams > 1 {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some(
                    "Відео містить кілька відеодоріжок, які поточний експорт не зберігає. \
                     Вихідний файл не створено, оригінал збережено."
                        .to_string(),
                ),
            )
            .await;
            continue;
        }
        if job.metadata.attached_picture_streams > 0 || job.metadata.unhandled_streams > 0 {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some(
                    "Відео містить вкладені зображення або невідомі потоки, які поточний експорт \
                     не зберігає. Вихідний файл не створено, оригінал збережено."
                        .to_string(),
                ),
            )
            .await;
            continue;
        }
        if job.metadata.is_hdr {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some(
                    "Виявлено HDR. Поточний процес не гарантує збереження HDR; вихідний файл залишено без змін."
                        .to_string(),
                ),
            )
            .await;
            continue;
        }
        let Some(encoder) = select_encoder(&job, &tools) else {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some("У FFmpeg не знайдено сумісного відеокодера.".to_string()),
            )
            .await;
            continue;
        };

        update_job(&state, &app, &job.id, |current| {
            current.status = JobStatus::Preparing;
            current.encoder = Some(encoder.name.clone());
            current.error = None;
        })
        .await;

        let output = match output_path(&job) {
            Ok(path) => path,
            Err(error) => {
                finish_job(&state, &app, &job.id, JobStatus::Failed, Some(error)).await;
                continue;
            }
        };
        let Some(directory) = output.parent() else {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some("Не вдалося визначити теку для результату.".to_string()),
            )
            .await;
            continue;
        };
        if let Err(error) = tokio::fs::create_dir_all(directory).await {
            finish_job(
                &state,
                &app,
                &job.id,
                JobStatus::Failed,
                Some(format!("Не вдалося створити теку для результату: {error}")),
            )
            .await;
            continue;
        }
        let temporary = directory.join(format!(
            ".{}.{}.tmp.{}",
            job.id,
            Uuid::new_v4(),
            output_extension(&job)
        ));
        let cancellation = Arc::new(Notify::new());
        *state.cancel_current.lock().await = Some(cancellation.clone());
        update_job(&state, &app, &job.id, |current| {
            current.status = JobStatus::Encoding;
            current.progress = 0.0;
            current.speed = None;
            current.eta_seconds = None;
            current.encoder = Some(encoder.name.clone());
            current.diagnostic_log = None;
        })
        .await;
        let _ = state.persist().await;

        let result = encode_with_fallback(
            &app,
            &state,
            &job,
            &tools,
            &encoder,
            &temporary,
            cancellation.clone(),
        )
        .await;
        *state.cancel_current.lock().await = None;

        match result {
            Ok(true) => {
                let _ = tokio::fs::remove_file(&temporary).await;
                finish_job(&state, &app, &job.id, JobStatus::Cancelled, None).await;
            }
            Err(error) => {
                let _ = tokio::fs::remove_file(&temporary).await;
                finish_job(&state, &app, &job.id, JobStatus::Failed, Some(error)).await;
            }
            Ok(false) => {
                update_job(&state, &app, &job.id, |current| {
                    current.status = JobStatus::Validating;
                    current.progress = 99.0;
                })
                .await;
                let validation = validate_output(&tools, &job, &temporary).await;
                match validation {
                    Ok(size) => {
                        if let Err(error) = tokio::fs::rename(&temporary, &output).await {
                            let _ = tokio::fs::remove_file(&temporary).await;
                            finish_job(
                                &state,
                                &app,
                                &job.id,
                                JobStatus::Failed,
                                Some(format!("Не вдалося опублікувати готовий файл: {error}")),
                            )
                            .await;
                            continue;
                        }
                        update_job(&state, &app, &job.id, |current| {
                            current.status = JobStatus::Completed;
                            current.progress = 100.0;
                            current.output_path = Some(output.to_string_lossy().into_owned());
                            current.output_size = Some(size);
                            current.elapsed_seconds = Some(started.elapsed().as_secs_f64());
                            current.result_warning = compression_result_warning(
                                job.source_size,
                                job.target_size_bytes,
                                size,
                            );
                            current.error = None;
                        })
                        .await;
                        let _ = state.persist().await;
                    }
                    Err(error) => {
                        let _ = tokio::fs::remove_file(&temporary).await;
                        finish_job(&state, &app, &job.id, JobStatus::Failed, Some(error)).await;
                    }
                }
            }
        }
    }
}

fn should_process_job(
    status: &JobStatus,
    id: &str,
    selected_job_ids: Option<&HashSet<String>>,
) -> bool {
    *status == JobStatus::Pending && selected_job_ids.is_none_or(|selected| selected.contains(id))
}

fn target_size_warning(target_size: Option<u64>, actual_size: u64) -> Option<String> {
    let target_size = target_size.filter(|size| *size > 0)?;
    let deviation = actual_size.abs_diff(target_size) as f64 / target_size as f64;
    if deviation <= 0.05 {
        return None;
    }

    let percentage = (deviation * 100.0).round() as u64;
    let direction = if actual_size > target_size {
        "перевищує"
    } else {
        "менший за"
    };
    Some(format!(
        "Фактичний розмір на {percentage}% {direction} цільовий. Перевірте якість результату."
    ))
}

fn compression_result_warning(
    source_size: u64,
    target_size: Option<u64>,
    actual_size: u64,
) -> Option<String> {
    let target_warning = target_size_warning(target_size, actual_size);
    let no_savings = (actual_size >= source_size).then(|| {
        "Вихідний файл не менший за оригінал: місця не заощаджено. Оригінал залишився без змін."
            .to_string()
    });

    match (target_warning, no_savings) {
        (Some(target), Some(savings)) => Some(format!("{target} {savings}")),
        (Some(warning), None) | (None, Some(warning)) => Some(warning),
        (None, None) => None,
    }
}

pub(crate) async fn update_job(
    state: &AppState,
    app: &AppHandle,
    id: &str,
    update: impl FnOnce(&mut VideoJob),
) {
    if let Some(job) = state.jobs.write().await.iter_mut().find(|job| job.id == id) {
        update(job);
    }
    state.snapshot(app).await;
}

async fn finish_job(
    state: &AppState,
    app: &AppHandle,
    id: &str,
    status: JobStatus,
    error: Option<String>,
) {
    update_job(state, app, id, |job| {
        job.status = status;
        job.speed = None;
        job.eta_seconds = None;
        job.error = error;
        if !matches!(job.status, JobStatus::Completed) {
            job.elapsed_seconds = None;
            job.output_path = None;
            job.output_size = None;
            job.result_warning = None;
        }
    })
    .await;
    let _ = state.persist().await;
}

#[cfg(test)]
mod tests {
    use super::{compression_result_warning, should_process_job, target_size_warning};
    use crate::models::JobStatus;
    use std::collections::HashSet;

    #[test]
    fn selected_queue_run_ignores_unselected_pending_jobs() {
        let selected = HashSet::from(["selected".to_string()]);

        assert!(should_process_job(
            &JobStatus::Pending,
            "selected",
            Some(&selected)
        ));
        assert!(!should_process_job(
            &JobStatus::Pending,
            "other",
            Some(&selected)
        ));
        assert!(!should_process_job(
            &JobStatus::Failed,
            "selected",
            Some(&selected)
        ));
        assert!(should_process_job(&JobStatus::Pending, "other", None));
    }

    #[test]
    fn target_size_warning_respects_five_percent_tolerance() {
        assert_eq!(target_size_warning(Some(1_000), 1_050), None);
        assert!(target_size_warning(Some(1_000), 1_100).is_some());
        assert!(target_size_warning(Some(1_000), 900).is_some());
        assert_eq!(target_size_warning(None, 10_000), None);
    }

    #[test]
    fn warns_when_compression_does_not_reduce_the_source_size() {
        assert_eq!(compression_result_warning(1_000, None, 999), None);
        assert!(compression_result_warning(1_000, None, 1_000).is_some());
        assert!(compression_result_warning(1_000, None, 1_200).is_some());
    }

    #[test]
    fn target_size_warning_is_combined_with_a_no_savings_warning() {
        let warning = compression_result_warning(1_000, Some(1_100), 1_200).unwrap();

        assert!(warning.contains("цільовий"));
        assert!(warning.contains("місця не заощаджено"));
    }
}
