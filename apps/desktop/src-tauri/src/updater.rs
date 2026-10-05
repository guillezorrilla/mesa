//! The app's own updates (ADR-0018). Core picks the channel, the newest release and the feed it
//! came from (`mesa update check`); this module downloads it through Tauri's updater plugin, which
//! verifies the signature with the public key in tauri.conf.json, holds it until Install, and
//! tells the renderer each step on `update://state`. This is Mesa's only installer: `mesa update
//! install` opens `mesa://update/install`, which lands here. The schedule lives here, apart from
//! the renderer, so a broken screen still updates.

mod state;

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

pub use state::Trigger;
use state::{Ready, State, Status};

const FIRST_CHECK: Duration = Duration::from_secs(15);
const EVERY: Duration = Duration::from_secs(4 * 60 * 60);
/// What `mesa update install` opens (core's UPDATE_LINK).
pub const UPDATE_LINK: &str = "mesa://update/install";

/// The plugin's update and its verified bytes.
type Download = (Update, Vec<u8>);

#[derive(Default)]
pub struct Updates {
    inner: Mutex<State<Download>>,
    /// One check at a time: the schedule, the menu and a link may ask together.
    busy: tauri::async_runtime::Mutex<()>,
}

impl Updates {
    fn with<T>(&self, app: &AppHandle, change: impl FnOnce(&mut State<Download>) -> T) -> T {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let out = change(&mut inner);
        let _ = app.emit("update://state", &inner.status);
        out
    }
}

/// Runs `mesa --json <args>` off the async runtime and returns its data.
async fn mesa(args: &[&str]) -> Result<Value, String> {
    let args: Vec<String> = ["--json"]
        .iter()
        .chain(args)
        .map(|s| s.to_string())
        .collect();
    let envelope = tauri::async_runtime::spawn_blocking(move || crate::bridge::run(&args))
        .await
        .map_err(|e| e.to_string())??;
    if envelope["ok"] == true {
        Ok(envelope["data"].clone())
    } else {
        Err(envelope["error"]["message"]
            .as_str()
            .unwrap_or("mesa failed")
            .to_string())
    }
}

/// Why this copy cannot replace itself: a development build, a copy run from the disk image or
/// translocated by Gatekeeper, or an ad-hoc signed build (an update would not keep its identity).
fn cannot_update() -> Option<String> {
    if cfg!(debug_assertions) {
        return Some("This is a development build, which does not update itself.".into());
    }
    let exe = std::env::current_exe().ok()?;
    if crate::install_location::not_installed(&exe) {
        return Some(
            "Mesa is running from the disk image or a temporary copy. Move it to Applications to \
             update it."
                .into(),
        );
    }
    let app = exe.ancestors().nth(3).unwrap_or(Path::new("/"));
    let signed = std::process::Command::new("/usr/bin/codesign")
        .args(["-dv", &app.to_string_lossy()])
        .output()
        .ok()?;
    adhoc(&String::from_utf8_lossy(&signed.stderr))
        .then(|| "This build is not signed for distribution, so it cannot update itself.".into())
}

fn adhoc(codesign: &str) -> bool {
    codesign.lines().any(|line| line == "Signature=adhoc")
}

/// Checks the profile's channel and downloads a newer version (state.rs has every outcome).
pub async fn check(app: AppHandle, trigger: Trigger) {
    let updates = app.state::<Updates>();
    let _busy = updates.busy.lock().await;
    let channel = mesa(&["update", "channel"]).await.ok();
    let channel = channel
        .as_ref()
        .and_then(|c| c["channel"].as_str())
        .unwrap_or("")
        .to_string();
    if !updates.with(&app, |state| {
        state.begin(&channel, trigger, SystemTime::now())
    }) {
        return;
    }
    let found = mesa(&["update", "check"]).await;
    let unsupported = tauri::async_runtime::spawn_blocking(cannot_update)
        .await
        .unwrap_or(None);
    let feed = updates.with(&app, |state| {
        state.checked(channel, found, unsupported, SystemTime::now())
    });
    let Some(feed) = feed else { return };
    let downloaded = fetch(&app, &feed).await;
    updates.with(&app, |state| state.downloaded(downloaded));
}

/// A check asked for by `mesa update install`, which has just found a newer version: it reaches
/// the feeds even inside the floor, so the handed-over update is always offered.
pub async fn check_now(app: AppHandle) {
    app.state::<Updates>().with(&app, |state| state.forget());
    check(app, Trigger::Person).await;
}

/// Downloads the release `feed` announces; the plugin refuses an archive whose signature does
/// not verify with tauri.conf.json's public key.
async fn fetch(app: &AppHandle, feed: &str) -> Result<Ready<Download>, String> {
    let url = Url::parse(feed).map_err(|e| e.to_string())?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .and_then(|builder| builder.build())
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Cannot read the update: {e}"))?
        .ok_or("The update is no longer published.")?;
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| {
        format!(
            "The update to {} was refused: {e}. Nothing was changed.",
            update.version
        )
    })?;
    Ok(Ready {
        version: update.version.clone(),
        payload: (update, bytes),
    })
}

/// At launch: the running version's revocation, then a check after 15 s and every 4 hours. A
/// development build checks only when asked.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(revoked) = mesa(&["update", "revoked"]).await {
            app.state::<Updates>()
                .with(&app, |state| state.set_revoked(revoked));
        }
        if cfg!(debug_assertions) {
            return;
        }
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(app.clone(), Trigger::Schedule).await;
            tokio::time::sleep(EVERY).await;
        }
    });
}

#[tauri::command]
pub fn update_status(updates: tauri::State<'_, Updates>) -> Status {
    updates
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .status
        .clone()
}

#[tauri::command]
pub async fn update_check(app: AppHandle) {
    check(app, Trigger::Person).await;
}

#[tauri::command]
pub fn update_later(app: AppHandle, updates: tauri::State<'_, Updates>) {
    updates.with(&app, |state| state.later());
}

/// Replaces the app with the verified download and relaunches it. Sessions live in tmux, so they
/// keep running and the relaunched app shows them again.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let updates = app.state::<Updates>();
    // Not while a check may replace the download.
    let _busy = updates.busy.lock().await;
    let ready = updates
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take_ready();
    let Ready {
        version,
        payload: (update, bytes),
    } = ready.ok_or("No update is ready to install.")?;
    if let Err(error) = update.install(&bytes) {
        let error = error.to_string();
        updates.with(&app, |state| state.install_failed(&version, &error));
        return Err(error);
    }
    app.restart();
}

/// Quits from the revoked dialog: no window-close question, the version is not to be used.
#[tauri::command]
pub fn update_quit(app: AppHandle) {
    app.exit(0);
}

/// Opens the download page in the browser, for a build that cannot update itself.
#[tauri::command]
pub fn update_open_page(updates: tauri::State<'_, Updates>) -> Result<(), String> {
    let page = updates
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .status
        .page
        .clone();
    let page = page.ok_or("No download page is known yet.")?;
    std::process::Command::new("/usr/bin/open")
        .arg(page)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::adhoc;

    #[test]
    fn only_an_adhoc_signature_counts_as_adhoc() {
        assert!(adhoc(
            "Executable=/Applications/Mesa.app/Contents/MacOS/mesa-desktop\nSignature=adhoc\n"
        ));
        assert!(!adhoc(
            "Authority=Developer ID Application: Example (TEAM123)\nTeamIdentifier=TEAM123\n"
        ));
    }
}
