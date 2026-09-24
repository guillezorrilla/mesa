use std::path::PathBuf;
use std::process::Command;

use serde_json::Value;

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

/// Any result envelope on stdout is returned as-is, whatever the exit code: the renderer reads
/// `ok` and `error.code` itself (doctor exits 3 with its rows). No envelope means mesa itself
/// failed, and the error carries the exit code and stderr.
fn interpret(code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Result<Value, String> {
    if let Ok(v) = serde_json::from_slice::<Value>(stdout) {
        if v["ok"].is_boolean() {
            return Ok(v);
        }
    }
    let code = code.map_or("none (killed by a signal)".to_string(), |c| c.to_string());
    let stderr = String::from_utf8_lossy(stderr);
    let why = match stderr.trim() {
        "" => "no result envelope on stdout",
        text => text,
    };
    Err(format!("mesa exited with code {code}: {why}"))
}

/// Runs `mesa <args>` with the current environment (MESA_PROFILE included) and returns its envelope.
#[tauri::command]
async fn run_mesa(args: Vec<String>) -> Result<Value, String> {
    // Off the main thread so a slow command never freezes the window.
    tauri::async_runtime::spawn_blocking(move || {
        let output = mesa_command()?
            .args(&args)
            .output()
            .map_err(|e| format!("cannot start mesa: {e}"))?;
        interpret(output.status.code(), &output.stdout, &output.stderr)
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

#[cfg(test)]
mod tests {
    use super::interpret;

    #[test]
    fn envelopes_pass_through_whatever_the_exit_code() {
        let unhealthy = br#"{"ok":true,"data":[{"name":"tmux","ok":false}]}"#;
        assert_eq!(interpret(Some(3), unhealthy, b"").unwrap()["data"][0]["name"], "tmux");
        let usage = br#"{"ok":false,"error":{"code":"usage","message":"Unknown command: nope"}}"#;
        assert_eq!(interpret(Some(2), usage, b"").unwrap()["error"]["code"], "usage");
    }

    #[test]
    fn no_envelope_is_an_error_with_exit_code_and_stderr() {
        assert_eq!(
            interpret(Some(1), b"", b"TypeError: boom\n").unwrap_err(),
            "mesa exited with code 1: TypeError: boom"
        );
        assert_eq!(
            interpret(Some(0), b"not json", b"").unwrap_err(),
            "mesa exited with code 0: no result envelope on stdout"
        );
    }
}
