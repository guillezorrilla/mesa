mod bridge;
mod browser;
mod notifications;
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
            // The notification library installs its process-local delegate when its worker starts.
            // Install Mesa's delegate afterward so clicks from a previous launch are recoverable.
            let _ =
                tauri::async_runtime::block_on(mac_usernotifications::get_notification_settings());
            notifications::install(app.handle().clone());
            if let Err(error) = browser::serve_selection(app.handle()) {
                eprintln!("native browser selection unavailable: {error}");
            }
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
            notifications::notification_status,
            notifications::notification_request_permission,
            notifications::notification_send,
            notifications::notification_take_opened,
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
            browser::browser_owner
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
