//! Watches the profile's hook event logs (`~/.mesa/<profile>/sessions/events/`, core's
//! profile/paths.ts) and tells the renderer on `sessions://changed`, so the board looks and
//! notifications deliver when a hook lands instead of on a short poll (#895).

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tauri::Emitter;

/// Hooks come in bursts (a tool call's PostToolUse, then the next PreToolUse): one look for each.
const DEBOUNCE: Duration = Duration::from_millis(150);

/// The profile's hook event logs.
fn events_dir(home: &Path, profile: &str) -> PathBuf {
    home.join(".mesa")
        .join(profile)
        .join("sessions")
        .join("events")
}

/// Calls `changed` once, `debounce` after the first change in `dir` of each burst, for as long as
/// the returned watcher lives. The folder is made first (0700, as core makes it) so a fresh profile
/// is watched before its first hook.
pub fn watch(
    dir: &Path,
    debounce: Duration,
    changed: impl Fn() + Send + 'static,
) -> notify::Result<notify::RecommendedWatcher> {
    use std::os::unix::fs::DirBuilderExt;
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .map_err(notify::Error::io)?;
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok_and(|e| !e.kind.is_access()) {
            let _ = tx.send(());
        }
    })?;
    watcher.watch(dir, RecursiveMode::NonRecursive)?;
    std::thread::spawn(move || debounced(&rx, debounce, changed));
    Ok(watcher)
}

/// One `changed` per burst: `debounce` after a burst's first change, whatever came meanwhile.
/// Ends when every sender is dropped (the watcher with it).
fn debounced(rx: &mpsc::Receiver<()>, debounce: Duration, changed: impl Fn()) {
    while rx.recv().is_ok() {
        std::thread::sleep(debounce);
        while rx.try_recv().is_ok() {}
        changed();
    }
}

/// Starts the app's watcher on `profile`; it lives as long as the app. Without it the renderer's
/// fallback poll still looks.
pub fn start(app: &tauri::AppHandle, profile: &str) {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let handle = app.clone();
    match watch(
        &events_dir(Path::new(&home), profile),
        DEBOUNCE,
        move || {
            let _ = handle.emit("sessions://changed", ());
        },
    ) {
        // The app's lifetime: dropping it would stop the watch.
        Ok(watcher) => std::mem::forget(watcher),
        Err(error) => eprintln!("session events watcher unavailable: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Instant;

    #[test]
    fn a_burst_is_one_change_after_the_debounce() {
        let (tx, rx) = mpsc::channel();
        for _ in 0..5 {
            tx.send(()).unwrap();
        }
        drop(tx);
        let count = AtomicUsize::new(0);
        let start = Instant::now();
        debounced(&rx, Duration::from_millis(150), || {
            count.fetch_add(1, Ordering::SeqCst);
        });
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert!(start.elapsed() >= Duration::from_millis(150));
    }

    #[test]
    fn an_appended_hook_line_is_seen_within_a_second() {
        let dir = std::env::temp_dir().join(format!("mesa-events-{}", std::process::id()));
        let count = Arc::new(AtomicUsize::new(0));
        let seen = count.clone();
        let _watcher = watch(&dir, DEBOUNCE, move || {
            seen.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();
        // FSEvents starts delivering a moment after the stream is created.
        std::thread::sleep(Duration::from_millis(300));
        let start = Instant::now();
        std::fs::write(dir.join("aaaaaaaa.jsonl"), "{}\n").unwrap();
        while count.load(Ordering::SeqCst) == 0 && start.elapsed() < Duration::from_secs(2) {
            std::thread::sleep(Duration::from_millis(10));
        }
        let took = start.elapsed();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(took < Duration::from_secs(1), "first change after {took:?}");
    }
}
