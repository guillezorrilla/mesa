//! The embedded terminal (ADR-0007 and its amendment, SP-3): a pty runs a session's tmux attach,
//! and its output reaches xterm.js as base64 Tauri events. tmux keeps the session; closing a
//! terminal kills only its tmux client, never the window.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::bridge;

/// One running terminal: its pty, the writer into it, and the attach process.
pub struct Term {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl Term {
    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer.write_all(data).map_err(|e| e.to_string())?;
        self.writer.flush().map_err(|e| e.to_string())
    }
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }
    /// Ends the attach process: tmux keeps the window and its agent.
    pub fn kill(&mut self) -> Result<(), String> {
        self.child.kill().map_err(|e| e.to_string())
    }
}

/// Runs `argv` in a pty of `cols` x `rows`; `on_chunk` gets its output as it comes, and
/// `on_exit` runs once when the output ends. Tauri-free, so `cargo test` drives it.
pub fn spawn(
    argv: &[String],
    cols: u16,
    rows: u16,
    mut on_chunk: impl FnMut(&[u8]) -> bool + Send + 'static,
    on_exit: impl FnOnce() + Send + 'static,
) -> Result<Term, String> {
    let (program, args) = argv.split_first().ok_or("empty argv")?;
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(program);
    cmd.args(args);
    // What the outer terminal is (tmux reads it); the pane itself stays tmux-256color.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // An app opened from Finder may not have Homebrew's tmux on its PATH.
    let path = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{path}"));
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let mut buf = [0u8; 65536];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if !on_chunk(&buf[..n]) {
                        break;
                    }
                }
            }
        }
        on_exit();
    });
    Ok(Term { master: pair.master, writer, child })
}

/// Every open terminal, by id.
#[derive(Default)]
pub struct Terms {
    next: AtomicU32,
    open: Mutex<HashMap<String, Term>>,
}

/// The attach argv for a session, from core: `mesa attach --print --json -- <id>`.
fn attach_argv(session_id: &str) -> Result<Vec<String>, String> {
    let output = bridge::mesa_command(std::env::var_os("MESA_CLI"))?
        .args(["--json", "attach", "--print", "--", session_id])
        .output()
        .map_err(|e| format!("cannot start mesa: {e}"))?;
    let envelope: Value = bridge::interpret(output.status.code(), &output.stdout, &output.stderr)?;
    if envelope["ok"] != Value::Bool(true) {
        return Err(envelope["error"]["message"].as_str().unwrap_or("mesa attach failed").to_string());
    }
    envelope["data"]["argv"]
        .as_array()
        .ok_or("mesa attach --print gave no argv")?
        .iter()
        .map(|w| w.as_str().map(str::to_string).ok_or_else(|| "argv holds a non-string".to_string()))
        .collect()
}

/// Opens a terminal on `session_id`'s window; its output arrives as `term://data/<id>` events
/// (base64), and `term://exit/<id>` when the attach ends.
#[tauri::command]
pub async fn term_open(
    app: AppHandle,
    terms: State<'_, Terms>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let argv = tauri::async_runtime::spawn_blocking(move || attach_argv(&session_id))
        .await
        .map_err(|e| e.to_string())??;
    let id = format!("t{}", terms.next.fetch_add(1, Ordering::Relaxed) + 1);
    let (data, exit) = (format!("term://data/{id}"), format!("term://exit/{id}"));
    let (out, done) = (app.clone(), app);
    let term = spawn(
        &argv,
        cols,
        rows,
        move |chunk| out.emit(&data, base64::engine::general_purpose::STANDARD.encode(chunk)).is_ok(),
        move || {
            let _ = done.emit(&exit, ());
        },
    )?;
    terms.open.lock().unwrap().insert(id.clone(), term);
    Ok(id)
}

#[tauri::command]
pub fn term_write(terms: State<Terms>, term_id: String, data: String) -> Result<(), String> {
    let mut open = terms.open.lock().unwrap();
    open.get_mut(&term_id).ok_or("no such terminal")?.write(data.as_bytes())
}

/// The pty's size; the window's own size is `mesa resize`, which the renderer calls after this.
#[tauri::command]
pub fn term_resize(terms: State<Terms>, term_id: String, cols: u16, rows: u16) -> Result<(), String> {
    terms.open.lock().unwrap().get(&term_id).ok_or("no such terminal")?.resize(cols, rows)
}

/// Kills the terminal's tmux client; the window and its agent keep running.
#[tauri::command]
pub fn term_close(terms: State<Terms>, term_id: String) -> Result<(), String> {
    match terms.open.lock().unwrap().remove(&term_id) {
        Some(mut term) => term.kill(),
        None => Ok(()),
    }
}

/// Writes the macOS pasteboard: WKWebView refuses `navigator.clipboard` (SP-3), so OSC 52 copies
/// from tmux come here.
#[tauri::command]
pub fn clipboard_write(text: String) -> Result<(), String> {
    let mut pbcopy = std::process::Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    pbcopy.stdin.take().ok_or("no stdin")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    pbcopy.wait().map_err(|e| e.to_string())?;
    Ok(())
}

/// Reads the macOS pasteboard's text, for paste into a terminal.
#[tauri::command]
pub fn clipboard_read() -> Result<String, String> {
    let out = std::process::Command::new("pbpaste").output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn a_pty_runs_the_command_and_streams_its_output() {
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let (exited_tx, exited) = mpsc::channel::<()>();
        let argv = ["printf".to_string(), "hello from the pty".to_string()];
        let _term = spawn(
            &argv,
            80,
            24,
            move |chunk| tx.send(chunk.to_vec()).is_ok(),
            move || {
                let _ = exited_tx.send(());
            },
        )
        .expect("spawn printf");
        exited.recv_timeout(Duration::from_secs(5)).expect("printf ends");
        let out: Vec<u8> = rx.try_iter().flatten().collect();
        assert!(String::from_utf8_lossy(&out).contains("hello from the pty"));
    }

    #[test]
    fn the_pty_takes_its_size_and_input() {
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        // `stty size` prints rows and cols; `head -1` then echoes one typed line back.
        let argv = ["sh".to_string(), "-c".to_string(), "stty size; head -1".to_string()];
        let mut term = spawn(&argv, 100, 30, move |c| tx.send(c.to_vec()).is_ok(), || {}).expect("spawn sh");
        let mut seen = String::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !seen.contains("30 100") && std::time::Instant::now() < deadline {
            if let Ok(c) = rx.recv_timeout(Duration::from_millis(100)) {
                seen.push_str(&String::from_utf8_lossy(&c));
            }
        }
        assert!(seen.contains("30 100"), "stty size said: {seen:?}");
        term.write(b"typed line\n").expect("write");
        while !seen.contains("typed line\r\ntyped line") && std::time::Instant::now() < deadline {
            if let Ok(c) = rx.recv_timeout(Duration::from_millis(100)) {
                seen.push_str(&String::from_utf8_lossy(&c));
            }
        }
        assert!(seen.contains("typed line"), "echo: {seen:?}");
        term.kill().ok();
    }
}
