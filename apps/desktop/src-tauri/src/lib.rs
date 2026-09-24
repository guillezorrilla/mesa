mod bridge;

use serde_json::Value;

/// Runs `mesa <args>` with the current environment (MESA_PROFILE included) and returns its envelope.
#[tauri::command]
async fn run_mesa(args: Vec<String>) -> Result<Value, String> {
    // Off the main thread so a slow command never freezes the window.
    tauri::async_runtime::spawn_blocking(move || {
        let output = bridge::mesa_command(std::env::var_os("MESA_CLI"))?
            .args(&args)
            .output()
            .map_err(|e| format!("cannot start mesa: {e}"))?;
        bridge::interpret(output.status.code(), &output.stdout, &output.stderr)
    })
    .await
    .map_err(|e| format!("run_mesa task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_mesa])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
