mod bridge;
mod browser;
mod terminal;

use serde_json::Value;

/// Runs `mesa <args>` with the current environment (MESA_PROFILE included) and returns its envelope.
#[tauri::command]
async fn run_mesa(args: Vec<String>) -> Result<Value, String> {
    // Off the main thread so a slow command never freezes the window.
    tauri::async_runtime::spawn_blocking(move || bridge::run(&args))
        .await
        .map_err(|e| format!("run_mesa task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(terminal::Terms::default())
        .setup(|app| {
            browser::serve_selection(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_mesa,
            terminal::term_open,
            terminal::term_write,
            terminal::term_resize,
            terminal::term_ready,
            terminal::term_close,
            terminal::clipboard_write,
            browser::browser_open,
            browser::browser_navigate,
            browser::browser_bounds,
            browser::browser_close,
            browser::browser_probe,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_pick_start,
            browser::browser_pick_result,
            browser::browser_owner_pid
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
