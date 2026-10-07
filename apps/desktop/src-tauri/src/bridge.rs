//! How the app reaches the mesa CLI: where the CLI is, and what its output means.

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde_json::Value;

/// Builds the command that runs the mesa CLI: `cli` if given (the `MESA_CLI` override), else in a
/// release build the `mesa` executable beside the app's (Contents/MacOS/mesa, ADR-0017), else node
/// on this workspace's build.
pub fn mesa_command(cli: Option<OsString>) -> Result<Command, String> {
    let mut cmd = if let Some(cli) = cli {
        Command::new(cli)
    } else if !cfg!(debug_assertions) {
        let exe = std::env::current_exe().map_err(|e| format!("cannot find the app: {e}"))?;
        Command::new(exe.with_file_name("mesa"))
    } else {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|e| format!("cannot resolve repo root: {e}"))?;
        let mut cmd = Command::new("node");
        cmd.arg(repo.join("packages/cli/dist/mesa.js"));
        cmd
    };
    if let Some(helper) = crate::notifications::bundled_executable() {
        cmd.env("MESA_NOTIFICATION_HELPER", helper);
    }
    Ok(cmd)
}

/// Runs `mesa <args>` (see `mesa_command` for which mesa) and returns its
/// envelope: the one path from the app to the CLI, for `run_mesa` and the terminal's attach.
/// `stdin`, when given, is written to mesa's stdin: how a secret (a model's key) reaches the CLI,
/// never in argv.
pub fn run(args: &[String], stdin: Option<&str>) -> Result<Value, String> {
    let mut cmd = mesa_command(std::env::var_os("MESA_CLI"))?;
    cmd.args(args);
    output_of(cmd, stdin)
}

/// `cmd`'s envelope, with `stdin` written to it and closed; without, its stdin is empty.
fn output_of(mut cmd: Command, stdin: Option<&str>) -> Result<Value, String> {
    let mut child = cmd
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot start mesa: {e}"))?;
    if let (Some(text), Some(mut pipe)) = (stdin, child.stdin.take()) {
        pipe.write_all(text.as_bytes())
            .map_err(|e| format!("cannot write to mesa: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("cannot run mesa: {e}"))?;
    interpret(output.status.code(), &output.stdout, &output.stderr)
}

/// Any result envelope on stdout is returned as-is, whatever the exit code: the renderer reads
/// `ok` and `error.code` itself (doctor exits 3 with its rows). No envelope means mesa itself
/// failed, and the error carries the exit code and stderr.
pub fn interpret(code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Result<Value, String> {
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

#[cfg(test)]
mod tests {
    use super::{interpret, mesa_command, output_of};
    use std::process::Command;

    #[test]
    fn envelopes_pass_through_whatever_the_exit_code() {
        let unhealthy = br#"{"ok":true,"data":[{"name":"tmux","ok":false}]}"#;
        assert_eq!(
            interpret(Some(3), unhealthy, b"").unwrap()["data"][0]["name"],
            "tmux"
        );
        let usage = br#"{"ok":false,"error":{"code":"usage","message":"Unknown command: nope"}}"#;
        assert_eq!(
            interpret(Some(2), usage, b"").unwrap()["error"]["code"],
            "usage"
        );
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

    #[test]
    fn stdin_reaches_the_command_and_is_empty_without_one() {
        let echoed = output_of(
            Command::new("/bin/cat"),
            Some(r#"{"ok":true,"data":"key"}"#),
        );
        assert_eq!(echoed.unwrap()["data"], "key");
        let empty = output_of(Command::new("/bin/cat"), None).unwrap_err();
        assert_eq!(
            empty,
            "mesa exited with code 0: no result envelope on stdout"
        );
    }

    #[test]
    fn the_cli_override_wins_else_node_runs_the_workspace_build() {
        let custom = mesa_command(Some("/opt/mesa".into())).unwrap();
        assert_eq!(custom.get_program(), "/opt/mesa");

        let dev = mesa_command(None).unwrap();
        assert_eq!(dev.get_program(), "node");
        let script = dev
            .get_args()
            .next()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(script.ends_with("packages/cli/dist/mesa.js"), "{script}");
        assert!(std::path::Path::new(&script).is_file(), "{script}");
    }
}
