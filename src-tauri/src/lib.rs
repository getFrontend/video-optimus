mod commands;
mod encoding;
mod environment;
mod ffmpeg_process;
mod media;
mod models;
mod queue;
mod state;
mod validation;
mod worker;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            app.manage(state::AppState::load(data_directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::refresh_runtime,
            commands::get_snapshot,
            commands::enqueue_files,
            commands::enqueue_folder,
            commands::start_queue,
            commands::stop_queue,
            commands::cancel_current,
            commands::cancel_pending,
            commands::move_job,
            commands::reorder_job,
            commands::retry_job,
            commands::skip_job,
            commands::remove_job,
            commands::clear_completed,
            commands::update_settings,
            commands::open_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Video Optimus");
}
