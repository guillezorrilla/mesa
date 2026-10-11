use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// What the window keeps between launches: where it is, its size, and whether it fills the screen.
pub const FLAGS: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED)
    .union(StateFlags::FULLSCREEN);

/// Saves it now, before a restart or a relaunch that may skip the plugin's own save on exit.
pub fn save(app: &tauri::AppHandle) {
    if let Err(error) = app.save_window_state(FLAGS) {
        eprintln!("window state not saved: {error}");
    }
}
