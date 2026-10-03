//! The app's own updates (ADR-0018). Core picks the channel, the newest release and the feed it
//! came from (`mesa update check`); this module downloads it through Tauri's updater plugin, which
//! verifies the signature with the public key in tauri.conf.json, holds it until Install, and
//! tells the renderer each step on `update://state`. The schedule lives here, apart from the
//! renderer, so a broken screen still updates.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(15);
const EVERY: Duration = Duration::from_secs(4 * 60 * 60);
/// No two checks of one channel come closer than this, whoever asks.
const FLOOR: Duration = Duration::from_secs(10 * 60);
/// What `mesa update install` opens when the app is running (core's UPDATE_LINK).
pub const UPDATE_LINK: &str = "mesa://update/install";

/// What the renderer shows: the step, the newer version, and a revocation of the running one.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// idle, checking, downloading, ready, up-to-date, unsupported or failed.
    phase: &'static str,
    version: Option<String>,
    channel: Option<String>,
    /// Why the check failed, or why this build cannot update itself.
    message: Option<String>,
    /// Where to download Mesa by hand.
    page: Option<String>,
    /// `{version, reason}` when the running version is revoked.
    revoked: Option<Value>,
    /// Later was chosen for `version`: hidden until a newer one, a manual check, or a relaunch.
    dismissed: bool,
}

impl Default for Status {
    fn default() -> Self {
        Status {
            phase: "idle",
            version: None,
            channel: None,
            message: None,
            page: None,
            revoked: None,
            dismissed: false,
        }
    }
}

#[derive(Default)]
struct Inner {
    status: Status,
    /// When, and on which channel, the last check reached the feeds.
    last: Option<(Instant, String)>,
    /// The verified download, waiting for Install.
    ready: Option<(Update, Vec<u8>)>,
}

#[derive(Default)]
pub struct Updates {
    inner: Mutex<Inner>,
    /// One check at a time: the schedule, the menu and a link may ask together.
    busy: tauri::async_runtime::Mutex<()>,
}

impl Updates {
    fn with<T>(&self, app: &AppHandle, change: impl FnOnce(&mut Inner) -> T) -> T {
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

/// Checks the profile's channel and downloads a newer version. `manual` (the menu, Settings, the
/// revoked dialog, `mesa update install`) shows a dismissed update again.
pub async fn check(app: AppHandle, manual: bool) {
    let updates = app.state::<Updates>();
    let _busy = updates.busy.lock().await;
    let channel = mesa(&["update", "channel"]).await.ok();
    let channel = channel
        .as_ref()
        .and_then(|c| c["channel"].as_str())
        .unwrap_or("")
        .to_string();
    let recent = updates.with(&app, |inner| {
        let recent =
            matches!(&inner.last, Some((at, on)) if at.elapsed() < FLOOR && *on == channel);
        if recent && manual {
            inner.status.dismissed = false;
        }
        recent
    });
    if recent {
        return;
    }
    updates.with(&app, |inner| {
        if inner.status.phase != "ready" {
            inner.status.phase = "checking";
        }
    });
    let found = mesa(&["update", "check"]).await;
    let unsupported = cannot_update();
    let download = updates.with(&app, |inner| {
        let found = match found {
            Ok(found) => found,
            Err(message) => {
                inner.status.phase = "failed";
                inner.status.message = Some(message);
                return None;
            }
        };
        inner.last = Some((Instant::now(), channel.clone()));
        let latest = found["latest"].as_str().map(str::to_string);
        let status = &mut inner.status;
        status.channel = found["channel"].as_str().map(str::to_string);
        status.page = found["page"].as_str().map(str::to_string);
        status.revoked = Some(found["revoked"].clone()).filter(|r| !r.is_null());
        status.message = None;
        if manual || status.version != latest {
            status.dismissed = false;
        }
        status.version = latest.clone();
        if found["available"] != true {
            status.phase = "up-to-date";
            inner.ready = None;
            return None;
        }
        if let Some(reason) = unsupported {
            status.phase = "unsupported";
            status.message = Some(reason);
            return None;
        }
        if inner
            .ready
            .as_ref()
            .is_some_and(|(u, _)| Some(&u.version) == latest.as_ref())
        {
            status.phase = "ready";
            return None;
        }
        status.phase = "downloading";
        found["feed"].as_str().map(str::to_string)
    });
    let Some(feed) = download else { return };
    let downloaded = fetch(&app, &feed).await;
    updates.with(&app, |inner| match downloaded {
        Ok((update, bytes)) => {
            inner.status.phase = "ready";
            inner.status.version = Some(update.version.clone());
            inner.ready = Some((update, bytes));
        }
        Err(message) => {
            inner.status.phase = "failed";
            inner.status.message = Some(message);
            // The next check tries again rather than waiting out the floor.
            inner.last = None;
        }
    });
}

/// Downloads the release `feed` announces; the plugin refuses an archive whose signature does
/// not verify with tauri.conf.json's public key.
async fn fetch(app: &AppHandle, feed: &str) -> Result<(Update, Vec<u8>), String> {
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
    Ok((update, bytes))
}

/// At launch: the running version's revocation, then a check after 15 s and every 4 hours. A
/// development build checks only when asked.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(revoked) = mesa(&["update", "revoked"]).await {
            app.state::<Updates>().with(&app, |inner| {
                inner.status.revoked = Some(revoked).filter(|r| !r.is_null())
            });
        }
        if cfg!(debug_assertions) {
            return;
        }
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(app.clone(), false).await;
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
    check(app, true).await;
}

#[tauri::command]
pub fn update_later(app: AppHandle, updates: tauri::State<'_, Updates>) {
    updates.with(&app, |inner| inner.status.dismissed = true);
}

/// Replaces the app with the verified download and relaunches it. Sessions live in tmux, so they
/// keep running and the relaunched app shows them again.
#[tauri::command]
pub fn update_install(app: AppHandle, updates: tauri::State<'_, Updates>) -> Result<(), String> {
    let ready = updates
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .ready
        .take();
    let (update, bytes) = ready.ok_or("No update is ready to install.")?;
    if let Err(error) = update.install(&bytes) {
        updates.with(&app, |inner| {
            inner.status.phase = "failed";
            inner.status.message = Some(format!("Installing {} failed: {error}", update.version));
        });
        return Err(error.to_string());
    }
    app.restart();
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
