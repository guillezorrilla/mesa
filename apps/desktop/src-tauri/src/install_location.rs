//! Whether the app runs from where it was installed: opened from the DMG, or translocated by
//! Gatekeeper (a quarantined app run from Downloads), it is a copy that updates cannot replace.

use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Whether `exe` is in a mounted volume (the DMG) or a translocated copy.
fn not_installed(exe: &Path) -> bool {
    let path = exe.to_string_lossy();
    path.starts_with("/Volumes/") || path.contains("/AppTranslocation/")
}

/// Asks to be moved to /Applications when the release app runs from the DMG or a translocated path.
pub fn warn(app: &AppHandle) {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    if cfg!(debug_assertions) || !not_installed(&exe) {
        return;
    }
    app.dialog()
        .message(
            "Mesa is running from the disk image or a temporary copy. Quit Mesa, drag it into \
             your Applications folder, and open it from there, so updates and the mesa command work.",
        )
        .title("Move Mesa to Applications")
        .kind(MessageDialogKind::Warning)
        .show(|_| {});
}

#[cfg(test)]
mod tests {
    use super::not_installed;
    use std::path::Path;

    #[test]
    fn the_dmg_and_translocated_copies_are_not_installed() {
        assert!(not_installed(Path::new("/Volumes/Mesa/Mesa.app/Contents/MacOS/mesa-desktop")));
        assert!(not_installed(Path::new(
            "/private/var/folders/x/AppTranslocation/1234/d/Mesa.app/Contents/MacOS/mesa-desktop"
        )));
        assert!(!not_installed(Path::new("/Applications/Mesa.app/Contents/MacOS/mesa-desktop")));
    }
}
