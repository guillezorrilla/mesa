use std::path::PathBuf;
use std::process::Command;

/// Builds the command that runs the mesa CLI: `MESA_CLI` if set, else node on the workspace build.
fn mesa_command() -> Result<Command, String> {
    if let Some(cli) = std::env::var_os("MESA_CLI") {
        return Ok(Command::new(cli));
    }
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .map_err(|e| format!("cannot resolve repo root: {e}"))?;
    let mut cmd = Command::new("node");
    cmd.arg(repo.join("packages/cli/dist/mesa.js"));
    Ok(cmd)
}

/// Runs `mesa <args>` with the current environment and returns its stdout parsed as JSON.
#[tauri::command]
fn run_mesa(args: Vec<String>) -> Result<serde_json::Value, String> {
    let output = mesa_command()?
        .args(&args)
        .output()
        .map_err(|e| format!("cannot start mesa: {e}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        return Err(format!(
            "mesa exited with code {:?}: {}",
            output.status.code(),
            stderr.trim()
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|e| {
        format!(
            "mesa printed invalid JSON (code {:?}): {e}; stderr: {}",
            output.status.code(),
            stderr.trim()
        )
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_mesa])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
