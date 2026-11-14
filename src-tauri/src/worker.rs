use crate::{
    encoding::select_encoder,
    ffmpeg_process::encode_with_fallback,
    models::{JobStatus, VideoJob},
    state::AppState,
    validation::{output_path, validate_output},
};
use std::{sync::Arc, time::Instant};
use tauri::AppHandle;
use tokio::sync::Notify;
use uuid::Uuid;

pub async fn run_queue(app: AppHandle, state: AppState) {
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
            .find(|job| job.status == JobStatus::Pending)
            .cloned();
        let Some(job) = next else { break };
        let started = Instant::now();
        let tools = state.tools.read().await.clone();
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
        let temporary = directory.join(format!(".{}.{}.tmp.mp4", job.id, Uuid::new_v4()));
        let cancellation = Arc::new(Notify::new());
        *state.cancel_current.lock().await = Some(cancellation.clone());
        update_job(&state, &app, &job.id, |current| {
            current.status = JobStatus::Encoding;
            current.progress = 0.0;
            current.speed = None;
            current.eta_seconds = None;
            current.encoder = Some(encoder.name.clone());
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
        }
    })
    .await;
    let _ = state.persist().await;
}
