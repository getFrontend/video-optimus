use crate::{queue, state::AppState};
use std::{sync::atomic::Ordering, time::Duration};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const QUIT_REQUESTED_EVENT: &str = "quit-requested";

const WORKER_STOP_POLL: Duration = Duration::from_millis(100);
const WORKER_STOP_ATTEMPTS: u32 = 100;

fn is_busy(app: &AppHandle) -> bool {
    app.state::<AppState>().worker_active.load(Ordering::SeqCst)
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if is_busy(window.app_handle()) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn request_quit(app: &AppHandle) {
    if is_busy(app) {
        show_main_window(app);
        let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    } else {
        app.exit(0);
    }
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>().inner().clone();
    queue::stop_queue(&app, &state).await;
    let _ = queue::cancel_current(&state).await;
    for _ in 0..WORKER_STOP_ATTEMPTS {
        if !state.worker_active.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(WORKER_STOP_POLL).await;
    }
    app.exit(0);
    Ok(())
}
