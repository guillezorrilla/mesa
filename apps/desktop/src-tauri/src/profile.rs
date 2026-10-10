//! Which profile this app runs: MESA_PROFILE when set, else the last one chosen in the app
//! (`mesa profile use` writes `~/.mesa/.app-profile`, core's profile/paths.ts), else `default`.
//! Every `mesa` the app starts inherits MESA_PROFILE. Switching quits and reopens the app on the
//! other profile, so its tmux server, notifications and windows all start clean.

use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;

/// Core's rule for a profile name (profile/profile-name.ts).
fn valid_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The app's last profile under `home`, when it is still an initialised profile.
fn last_used(home: &Path) -> Option<String> {
    let mesa = home.join(".mesa");
    let name = std::fs::read_to_string(mesa.join(".app-profile")).ok()?;
    let name = name.trim();
    (valid_name(name) && mesa.join(name).join("config.yaml").is_file()).then(|| name.to_string())
}

/// Sets MESA_PROFILE to the last-used profile unless the launch set one. Runs first, before any
/// thread, as shell_path::fix does for PATH.
pub fn resolve() -> String {
    if let Ok(profile) = std::env::var("MESA_PROFILE") {
        return profile;
    }
    let chosen = std::env::var_os("HOME")
        .and_then(|home| last_used(Path::new(&home)))
        .unwrap_or_else(|| "default".into());
    std::env::set_var("MESA_PROFILE", &chosen);
    chosen
}

/// Quits and reopens the app on `profile`, with `notice` to open when a notification click asked
/// for it. Waiting instead of `open -n` keeps one app and one Dock icon: a second instance gets
/// its own tile, which stays after the first one quits.
pub fn relaunch(app: &tauri::AppHandle, profile: &str, notice: Option<&str>) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    if let Some(bundle) = executable
        .ancestors()
        .find(|path| path.extension() == Some(OsStr::new("app")))
    {
        Command::new("/bin/sh")
            .arg("-c")
            .arg(concat!(
                r#"while /bin/kill -0 "$0" 2>/dev/null; do /bin/sleep 0.1; done; "#,
                r#"exec /usr/bin/open -a "$1" --env "MESA_PROFILE=$2" ${3:+--env "MESA_OPEN_NOTIFICATION=$3"}"#
            ))
            .arg(std::process::id().to_string())
            .arg(bundle)
            .arg(profile)
            .arg(notice.unwrap_or(""))
            .spawn()
            .map_err(|error| error.to_string())?;
    } else {
        // A dev build outside a bundle has no Dock tile to keep.
        let mut direct = Command::new(executable);
        direct.env("MESA_PROFILE", profile);
        if let Some(id) = notice {
            direct.env("MESA_OPEN_NOTIFICATION", id);
        }
        direct.spawn().map_err(|error| error.to_string())?;
    }
    app.exit(0);
    Ok(())
}

/// Relaunches the app on `profile`: this instance quits, then the app reopens on it.
#[tauri::command]
pub fn profile_switch(app: tauri::AppHandle, profile: String) -> Result<(), String> {
    if !valid_name(&profile) {
        return Err(format!("invalid profile name {profile}"));
    }
    relaunch(&app, &profile, None)
}

#[cfg(test)]
mod tests {
    use super::{last_used, valid_name};
    use std::fs;

    #[test]
    fn names_follow_core() {
        assert!(valid_name("work_1-a"));
        assert!(!valid_name(""));
        assert!(!valid_name("../x"));
        assert!(!valid_name(&"a".repeat(65)));
    }

    #[test]
    fn last_used_needs_an_initialised_profile() {
        let home = std::env::temp_dir().join(format!("mesa-profile-{}", std::process::id()));
        let mesa = home.join(".mesa");
        fs::create_dir_all(mesa.join("work")).unwrap();
        fs::write(mesa.join(".app-profile"), "work\n").unwrap();
        assert_eq!(last_used(&home), None);
        fs::write(mesa.join("work/config.yaml"), "vault: /v\n").unwrap();
        assert_eq!(last_used(&home).as_deref(), Some("work"));
        fs::write(mesa.join(".app-profile"), "../etc\n").unwrap();
        assert_eq!(last_used(&home), None);
        fs::remove_dir_all(&home).unwrap();
    }
}
