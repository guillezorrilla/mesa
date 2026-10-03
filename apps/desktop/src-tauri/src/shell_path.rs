//! A GUI launch gets launchd's PATH (/usr/bin:/bin:/usr/sbin:/sbin), which misses Homebrew's tmux
//! and the user's claude and codex, so the app takes its login shell's PATH at startup. The folder
//! of the app's own executable goes first, so `mesa` (Contents/MacOS/mesa) resolves in every
//! session the app starts.

use std::process::{Command, Stdio};

const MARK: &str = "__MESA_PATH__";

/// Sets this process's PATH, which every command the app starts inherits, to the login shell's.
/// ponytail: no timeout; a login shell that hangs with no stdin would hang startup. Add one if
/// that shows.
pub fn fix() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let printed = Command::new(shell)
        // Interactive too: nvm and the like are set up in .zshrc, not .zprofile.
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    let current = std::env::var("PATH").unwrap_or_default();
    let own = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_string_lossy().into_owned()));
    std::env::set_var("PATH", merged(&printed, &current, own.as_deref()));
}

/// The PATH between the marks in a shell's output (rc files may print around it), else `current`,
/// with `own` (the app's executable folder) first and Homebrew's folders added when missing.
fn merged(printed: &str, current: &str, own: Option<&str>) -> String {
    let shell = printed.split(MARK).nth(1).filter(|p| !p.is_empty());
    let mut dirs: Vec<&str> = shell.unwrap_or(current).split(':').collect();
    if let Some(own) = own {
        dirs.retain(|dir| *dir != own);
        dirs.insert(0, own);
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

#[cfg(test)]
mod tests {
    use super::merged;

    #[test]
    fn the_shells_path_wins_over_rc_noise_and_homebrew_is_always_there() {
        let printed = "welcome!\n__MESA_PATH__/Users/me/.local/bin:/usr/bin__MESA_PATH__";
        assert_eq!(
            merged(printed, "/usr/bin:/bin", None),
            "/Users/me/.local/bin:/usr/bin:/opt/homebrew/bin:/usr/local/bin"
        );
        assert_eq!(
            merged("", "/opt/homebrew/bin:/usr/bin", None),
            "/opt/homebrew/bin:/usr/bin:/usr/local/bin"
        );
    }

    #[test]
    fn the_apps_own_folder_comes_first_once_so_mesa_resolves() {
        let own = "/Applications/Mesa.app/Contents/MacOS";
        let printed = format!("__MESA_PATH__/usr/bin:{own}__MESA_PATH__");
        assert_eq!(
            merged(&printed, "/usr/bin:/bin", Some(own)),
            format!("{own}:/usr/bin:/opt/homebrew/bin:/usr/local/bin")
        );
    }
}
