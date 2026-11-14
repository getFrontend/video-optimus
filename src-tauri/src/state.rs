use crate::{
    media::MediaTools,
    models::{AppSettings, AppSnapshot, JobStatus, VideoJob},
};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub jobs: Arc<RwLock<Vec<VideoJob>>>,
    pub tools: Arc<RwLock<MediaTools>>,
    pub settings: Arc<RwLock<AppSettings>>,
    pub data_directory: PathBuf,
    pub worker_active: Arc<AtomicBool>,
    pub stop_requested: Arc<AtomicBool>,
    pub cancel_current: Arc<Mutex<Option<Arc<Notify>>>>,
    pub inflight_paths: Arc<Mutex<HashSet<String>>>,
    pub persistence_lock: Arc<Mutex<()>>,
}

impl AppState {
    pub fn load(data_directory: PathBuf) -> Self {
        let queue_path = data_directory.join("queue.json");
        let mut jobs: Vec<VideoJob> = std::fs::read(&queue_path)
            .ok()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default();
        for job in &mut jobs {
            if matches!(
                job.status,
                JobStatus::Analyzing
                    | JobStatus::Preparing
                    | JobStatus::Encoding
                    | JobStatus::Validating
            ) {
                remove_partial_output(job);
                job.status = JobStatus::Interrupted;
                job.error = Some("Обробку перервано через закриття програми.".to_string());
            }
        }
        let settings = std::fs::read(data_directory.join("settings.json"))
            .ok()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default();

        Self {
            jobs: Arc::new(RwLock::new(jobs)),
            tools: Arc::new(RwLock::new(MediaTools::empty())),
            settings: Arc::new(RwLock::new(settings)),
            data_directory,
            worker_active: Arc::new(AtomicBool::new(false)),
            stop_requested: Arc::new(AtomicBool::new(false)),
            cancel_current: Arc::new(Mutex::new(None)),
            inflight_paths: Arc::new(Mutex::new(HashSet::new())),
            persistence_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn snapshot(&self, app: &AppHandle) -> AppSnapshot {
        let jobs = self.jobs.read().await.clone();
        let runtime = self.tools.read().await.runtime.clone();
        let queue_running = self.worker_active.load(Ordering::Relaxed);
        let queue_paused = queue_running
            && self
                .stop_requested
                .load(std::sync::atomic::Ordering::SeqCst);
        let settings = self.settings.read().await.clone();
        let total_saved_bytes = jobs
            .iter()
            .filter_map(|job| {
                job.output_size
                    .map(|size| job.source_size.saturating_sub(size))
            })
            .sum();
        let snapshot = AppSnapshot {
            jobs,
            runtime,
            queue_running,
            queue_paused,
            total_saved_bytes,
            settings,
        };
        let _ = app.emit("app-snapshot", &snapshot);
        snapshot
    }

    pub async fn persist(&self) -> Result<(), String> {
        let _guard = self.persistence_lock.lock().await;
        tokio::fs::create_dir_all(&self.data_directory)
            .await
            .map_err(|error| format!("Не вдалося створити теку даних: {error}"))?;
        let data = serde_json::to_vec(&*self.jobs.read().await)
            .map_err(|error| format!("Не вдалося зберегти чергу: {error}"))?;
        let temporary = self.data_directory.join("queue.json.tmp");
        let destination = self.data_directory.join("queue.json");
        tokio::fs::write(&temporary, data)
            .await
            .map_err(|error| format!("Не вдалося записати чергу: {error}"))?;
        tokio::fs::rename(&temporary, &destination)
            .await
            .map_err(|error| format!("Не вдалося оновити чергу: {error}"))
    }

    pub async fn persist_settings(&self) -> Result<(), String> {
        let _guard = self.persistence_lock.lock().await;
        tokio::fs::create_dir_all(&self.data_directory)
            .await
            .map_err(|error| format!("Не вдалося створити теку даних: {error}"))?;
        let settings = serde_json::to_vec(&*self.settings.read().await)
            .map_err(|error| format!("Не вдалося зберегти налаштування: {error}"))?;
        tokio::fs::write(self.data_directory.join("settings.json"), settings)
            .await
            .map_err(|error| format!("Не вдалося зберегти налаштування: {error}"))
    }
}

fn remove_partial_output(job: &VideoJob) {
    let source = PathBuf::from(&job.path);
    let directory = job
        .output_directory
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| source.parent().map(PathBuf::from));
    let Some(directory) = directory else {
        return;
    };
    if let Ok(entries) = std::fs::read_dir(directory) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(&format!(".{}.", job.id)) && name.ends_with(".tmp.mp4") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}
