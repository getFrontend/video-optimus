use tauri::{plugin::TauriPlugin, Runtime};

pub fn snap_layout_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_snap_layout::init()
        .button_id("maximize-window-button")
        .build()
}
