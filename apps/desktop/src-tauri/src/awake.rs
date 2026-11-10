use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::State;

/// Keep awake (CONTEXT.md): at most one `caffeinate -i -w <app pid>` child, an idle-sleep
/// assertion that macOS drops when the app exits, so a crash never leaves the Mac awake.
#[derive(Default)]
pub struct Awake(Mutex<Option<Child>>);

/// Holds the assertion; a second hold while one runs is a no-op.
#[tauri::command]
pub fn awake_hold(awake: State<'_, Awake>) -> Result<(), String> {
    let mut held = awake.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(child) = held.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return Ok(());
        }
    }
    let child = Command::new("/usr/bin/caffeinate")
        .args(["-i", "-w", &std::process::id().to_string()])
        .spawn()
        .map_err(|e| format!("caffeinate failed to start: {e}"))?;
    *held = Some(child);
    Ok(())
}

/// Releases the assertion, if one is held.
#[tauri::command]
pub fn awake_release(awake: State<'_, Awake>) {
    if let Some(mut child) = awake.0.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
