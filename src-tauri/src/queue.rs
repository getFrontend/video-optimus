use crate::{
    models::{
        CompressionMode, CustomSettings, EnqueueResult, JobStatus, OutputContainer, QualityProfile,
        VideoJob,
    },
    state::AppState,
};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use uuid::Uuid;

mod actions;
pub use actions::*;

const VIDEO_EXTENSIONS: [&str; 10] = [
    "mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mpg", "mpeg", "mts",
];

pub async fn enqueue_paths(
    state: &AppState,
    paths: Vec<String>,
    mode: CompressionMode,
    quality: QualityProfile,
    output_directory: Option<String>,
    target_size_bytes: Option<u64>,
    custom_settings: CustomSettings,
) -> Result<EnqueueResult, String> {
    custom_settings.validate()?;
    let tools = state.tools.read().await.clone();
    let mut added = Vec::new();
    let mut rejected = Vec::new();
    let mut files = Vec::new();
    let mut reserved = Vec::new();

    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        if path.is_dir() {
            match scan_folder(&path) {
                Ok(folder_files) => files.extend(folder_files),
                Err(error) => rejected.push(format!("{}: {error}", path.display())),
            }
        } else {
            files.push(raw_path);
        }
    }

    for raw_path in files {
        let path = PathBuf::from(&raw_path);
        if !is_supported(&path) {
            rejected.push(format!("{}: формат не підтримується", path.display()));
            continue;
        }
        if !path.is_file() {
            rejected.push(format!("{}: файл не знайдено", path.display()));
            continue;
        }
        if !tools.runtime.ready {
            rejected.push(format!(
                "{}: FFmpeg і FFprobe не знайдено",
                path.file_name().unwrap_or_default().to_string_lossy()
            ));
            continue;
        }

        let normalized = path
            .canonicalize()
            .unwrap_or_else(|_| path.clone())
            .to_string_lossy()
            .to_lowercase();
        let mut inflight = state.inflight_paths.lock().await;
        let exists = state.jobs.read().await.iter().any(|job| {
            Path::new(&job.path)
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(&job.path))
                .to_string_lossy()
                .to_lowercase()
                == normalized
        });
        if exists || inflight.contains(&normalized) {
            rejected.push(format!("{}: файл уже додано до черги", path.display()));
            continue;
        }
        inflight.insert(normalized.clone());
        reserved.push(normalized);
        drop(inflight);

        let metadata = match tools.analyze(&path).await {
            Ok(metadata) => metadata,
            Err(error) => {
                rejected.push(format!("{}: {error}", path.display()));
                continue;
            }
        };
        if matches!(mode, CompressionMode::Custom)
            && matches!(custom_settings.container, OutputContainer::Mp4)
            && crate::encoding::requires_matroska(&metadata)
        {
            rejected.push(format!(
                "{}: для збереження вкладень або субтитрів цього типу потрібен MKV. \
                 Виберіть MKV чи Автоматично.",
                path.file_name().unwrap_or_default().to_string_lossy()
            ));
            continue;
        }
        let source_size = match tokio::fs::metadata(&path).await {
            Ok(metadata) => metadata.len(),
            Err(error) => {
                rejected.push(format!(
                    "{}: немає доступу до файлу ({error})",
                    path.display()
                ));
                continue;
            }
        };
        let job = VideoJob {
            id: Uuid::new_v4().to_string(),
            file_name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            source_size,
            metadata,
            status: JobStatus::Pending,
            progress: 0.0,
            speed: None,
            eta_seconds: None,
            output_path: None,
            output_size: None,
            output_directory: output_directory.clone(),
            mode,
            quality,
            custom_settings,
            encoder: None,
            error: None,
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            elapsed_seconds: None,
            target_size_bytes,
            result_warning: None,
            diagnostic_log: None,
        };
        state.jobs.write().await.push(job.clone());
        added.push(job);
    }

    let mut inflight = state.inflight_paths.lock().await;
    for path in reserved {
        inflight.remove(&path);
    }
    drop(inflight);
    state.persist().await?;
    Ok(EnqueueResult { added, rejected })
}

pub fn scan_folder(path: &Path) -> Result<Vec<String>, String> {
    if !path.is_dir() {
        return Err("Вибрана тека недоступна.".to_string());
    }
    let mut files = Vec::new();
    scan_directory(path, &mut files)?;
    files.sort();
    Ok(files
        .into_iter()
        .map(|file| file.to_string_lossy().into_owned())
        .collect())
}

fn scan_directory(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(directory)
        .map_err(|error| format!("Не вдалося прочитати теку: {error}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Не вдалося прочитати елемент теки: {error}"))?;
        if file_type.is_dir() {
            scan_directory(&path, files)?;
        } else if file_type.is_file() && is_supported(&path) {
            files.push(path);
        }
    }
    Ok(())
}

pub fn is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| VIDEO_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
}

pub async fn start_queue(app: AppHandle, state: AppState) -> Result<(), String> {
    if !state.tools.read().await.runtime.ready {
        return Err("Щоб запустити чергу, встановіть FFmpeg і FFprobe.".to_string());
    }
    state.stop_requested.store(false, Ordering::SeqCst);
    if state.worker_active.swap(true, Ordering::SeqCst) {
        state.snapshot(&app).await;
        return Ok(());
    }
    let worker_app = app.clone();
    let worker_state = state.clone();
    tauri::async_runtime::spawn(async move {
        crate::worker::run_queue(worker_app.clone(), worker_state.clone(), None).await;
        worker_state.worker_active.store(false, Ordering::SeqCst);
        let _ = worker_state.persist().await;
        worker_state.snapshot(&worker_app).await;
    });
    state.snapshot(&app).await;
    Ok(())
}

pub async fn start_selected_queue(
    app: AppHandle,
    state: AppState,
    ids: Vec<String>,
) -> Result<(), String> {
    if !state.tools.read().await.runtime.ready {
        return Err("Щоб запустити чергу, встановіть FFmpeg і FFprobe.".to_string());
    }

    let requested: HashSet<String> = ids.into_iter().collect();
    if requested.is_empty() {
        return Err("Не вибрано відео для обробки.".to_string());
    }
    if state
        .worker_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(
            "Дочекайтеся завершення поточного відео перед окремим запуском вибраних.".to_string(),
        );
    }

    let current_settings = state.settings.read().await.clone();
    let mut retry_backups = Vec::new();
    let selected_jobs = {
        let mut jobs = state.jobs.write().await;
        let mut selected = HashSet::new();
        for job in jobs.iter_mut().filter(|job| requested.contains(&job.id)) {
            if job.status == JobStatus::Pending {
                selected.insert(job.id.clone());
                continue;
            }
            let previous = job.clone();
            if actions::reset_for_retry(job) {
                actions::apply_settings_to_job(job, &current_settings);
                selected.insert(job.id.clone());
                retry_backups.push(previous);
            }
        }
        selected
    };
    if selected_jobs.is_empty() {
        state.worker_active.store(false, Ordering::SeqCst);
        return Err(
            "Серед вибраних немає відео, яке очікує або потребує повторної обробки.".to_string(),
        );
    }
    if !retry_backups.is_empty() {
        if let Err(error) = state.persist().await {
            let mut jobs = state.jobs.write().await;
            for previous in retry_backups {
                if let Some(job) = jobs.iter_mut().find(|job| job.id == previous.id) {
                    *job = previous;
                }
            }
            state.worker_active.store(false, Ordering::SeqCst);
            drop(jobs);
            state.snapshot(&app).await;
            return Err(error);
        }
    }

    state.stop_requested.store(false, Ordering::SeqCst);
    let worker_app = app.clone();
    let worker_state = state.clone();
    tauri::async_runtime::spawn(async move {
        crate::worker::run_queue(
            worker_app.clone(),
            worker_state.clone(),
            Some(selected_jobs),
        )
        .await;
        worker_state.worker_active.store(false, Ordering::SeqCst);
        let _ = worker_state.persist().await;
        worker_state.snapshot(&worker_app).await;
    });
    state.snapshot(&app).await;
    Ok(())
}

pub async fn stop_queue(app: &AppHandle, state: &AppState) {
    state.stop_requested.store(true, Ordering::SeqCst);
    state.snapshot(app).await;
}

pub async fn cancel_current(state: &AppState) -> Result<(), String> {
    let active = state.cancel_current.lock().await.clone();
    match active {
        Some(cancel) => {
            cancel.notify_one();
            Ok(())
        }
        None => Err("Наразі немає активного завдання.".to_string()),
    }
}

pub async fn cancel_pending(state: &AppState) -> Result<(), String> {
    for job in state.jobs.write().await.iter_mut() {
        if job.status == JobStatus::Pending {
            job.status = JobStatus::Cancelled;
            job.error = Some("Скасовано до початку обробки.".to_string());
        }
    }
    state.persist().await
}

#[cfg(test)]
mod tests {
    use super::is_supported;
    use std::path::Path;

    #[test]
    fn accepts_supported_video_extensions_case_insensitively() {
        assert!(is_supported(Path::new("presentation.MP4")));
        assert!(is_supported(Path::new("lesson.mkv")));
        assert!(!is_supported(Path::new("notes.txt")));
    }
}
