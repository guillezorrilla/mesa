mod bridge;
mod browser;
mod install_location;
mod menu;
mod notifications;
mod profile;
mod shell_path;
mod terminal;
mod updater;

use serde_json::Value;
use tauri_plugin_deep_link::DeepLinkExt;

/// Runs `mesa <args>` with the current environment (MESA_PROFILE included, profile.rs), `stdin` on its stdin
/// when given (a secret, never argv), and returns its envelope.
#[tauri::command]
async fn run_mesa(args: Vec<String>, stdin: Option<String>) -> Result<Value, String> {
    // Off the main thread so a slow command never freezes the window.
    tauri::async_runtime::spawn_blocking(move || bridge::run(&args, stdin.as_deref()))
        .await
        .map_err(|e| format!("run_mesa task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(result) = notifications::background(&std::env::args().skip(1).collect::<Vec<_>>()) {
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    shell_path::fix();
    let launch_profile = profile::resolve();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(terminal::Terms::default())
        .manage(updater::Updates::default())
        .setup(move |app| {
            menu::install(app)?;
            install_location::warn(app.handle());
            updater::start(app.handle());
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if updater::asks_to_install(&event.urls()) {
                    tauri::async_runtime::spawn(updater::check(
                        handle.clone(),
                        updater::Trigger::Link,
                    ));
                }
            });
            // Started by the link (`mesa update install` with the app closed): macOS may deliver
            // it before the listener above exists, and the plugin then only keeps it as current.
            let current = app.deep_link().get_current().ok().flatten();
            if current.is_some_and(|urls| updater::asks_to_install(&urls)) {
                tauri::async_runtime::spawn(updater::check(
                    app.handle().clone(),
                    updater::Trigger::Link,
                ));
            }
            if let Err(error) = tauri::async_runtime::block_on(notifications::install(
                app.handle().clone(),
                launch_profile,
                std::env::var("MESA_OPEN_NOTIFICATION").ok(),
            )) {
                eprintln!("native notifications unavailable: {error}");
            }
            if let Err(error) = browser::serve_selection(app.handle()) {
                eprintln!("native browser selection unavailable: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_mesa,
            profile::profile_switch,
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
            browser::browser_owner,
            updater::update_status,
            updater::update_check,
            updater::update_later,
            updater::update_install,
            updater::update_open_page,
            updater::update_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
