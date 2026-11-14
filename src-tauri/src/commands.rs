use crate::{
    media::MediaTools,
    models::{
        AppSettings, AppSnapshot, CompressionMode, EnqueueOptions, EnqueueResult, QualityProfile,
    },
    queue,
    state::AppState,
};
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn initialize(app: AppHandle, state: State<'_, AppState>) -> Result<AppSnapshot, String> {
    let tools = MediaTools::discover().await;
    *state.tools.write().await = tools;
    state.persist().await?;
    Ok(state.snapshot(&app).await)
}

#[tauri::command]
pub async fn refresh_runtime(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppSnapshot, String> {
    let tools = MediaTools::discover().await;
    *state.tools.write().await = tools;
    Ok(state.snapshot(&app).await)
}

#[tauri::command]
pub async fn get_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppSnapshot, String> {
    Ok(state.snapshot(&app).await)
}

#[tauri::command]
pub async fn enqueue_files(
    app: AppHandle,
    state: State<'_, AppState>,
    options: EnqueueOptions,
) -> Result<EnqueueResult, String> {
    let result = queue::enqueue_paths(
        &state,
        options.paths,
        options.mode,
        options.quality,
        options.output_directory,
    )
    .await?;
    state.snapshot(&app).await;
    Ok(result)
}

#[tauri::command]
pub async fn enqueue_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    mode: CompressionMode,
    quality: QualityProfile,
    output_directory: Option<String>,
) -> Result<EnqueueResult, String> {
    let paths = queue::scan_folder(&PathBuf::from(path))?;
    let result = queue::enqueue_paths(&state, paths, mode, quality, output_directory).await?;
    state.snapshot(&app).await;
    Ok(result)
}

#[tauri::command]
pub async fn start_queue(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    queue::start_queue(app, state.inner().clone()).await
}

#[tauri::command]
pub async fn stop_queue(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    queue::stop_queue(&app, &state).await;
    Ok(())
}

#[tauri::command]
pub async fn cancel_current(state: State<'_, AppState>) -> Result<(), String> {
    queue::cancel_current(&state).await
}

#[tauri::command]
pub async fn cancel_pending(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    queue::cancel_pending(&state).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn move_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    direction: i32,
) -> Result<(), String> {
    queue::move_job(&state, &id, direction).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn reorder_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    target_index: usize,
) -> Result<(), String> {
    queue::reorder_job(&state, &id, target_index).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn retry_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    queue::retry_job(&state, &id).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn skip_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    queue::skip_job(&state, &id).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn remove_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    queue::remove_job(&state, &id).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_completed(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    queue::clear_completed(&state).await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    *state.settings.write().await = settings;
    state.persist_settings().await?;
    state.snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn open_path(path: String, reveal: bool) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("Файл або тека більше не існує.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = std::process::Command::new("explorer.exe");
        if reveal {
            command.arg("/select,").arg(&path);
        } else {
            command.arg(&path);
        }
        command
            .spawn()
            .map_err(|error| format!("Не вдалося відкрити шлях: {error}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let target = if reveal {
            path.parent().unwrap_or(&path)
        } else {
            &path
        };
        std::process::Command::new(if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        })
        .arg(target)
        .spawn()
        .map_err(|error| format!("Не вдалося відкрити шлях: {error}"))?;
    }
    Ok(())
}
