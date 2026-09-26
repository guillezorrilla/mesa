//! The embedded terminal (ADR-0007 and its amendment, SP-3): a pty runs a session's tmux attach,
//! and its output reaches xterm.js as base64 Tauri events. tmux keeps the session; closing a
//! terminal kills only its tmux client, never the window.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

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
    /// Ends the attach process and reaps it: tmux keeps the window and its agent.
    pub fn end(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
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

/// Output held until the renderer listens (Tauri events are not buffered), then passed on.
#[derive(Default)]
struct Gate {
    ready: bool,
    held: Vec<u8>,
}

type Shared = Arc<Mutex<Term>>;

/// Every open terminal, by id; each has its own lock, so one busy terminal never stalls another.
#[derive(Default)]
pub struct Terms {
    next: AtomicU32,
    open: Mutex<HashMap<String, (Shared, Arc<Mutex<Gate>>)>>,
}

impl Terms {
    fn get(&self, id: &str) -> Result<(Shared, Arc<Mutex<Gate>>), String> {
        self.open.lock().unwrap().get(id).cloned().ok_or_else(|| "no such terminal".to_string())
    }
    fn take(&self, id: &str) -> Option<Shared> {
        self.open.lock().unwrap().remove(id).map(|(term, _)| term)
    }
}

/// The attach argv for a session, from core: `mesa attach --print --json -- <id>`.
fn attach_argv(session_id: &str) -> Result<Vec<String>, String> {
    let args = ["--json", "attach", "--print", "--", session_id].map(String::from);
    argv_of(&bridge::run(&args)?)
}

/// The `argv` of a `mesa attach --print --json` envelope, or its error message.
fn argv_of(envelope: &Value) -> Result<Vec<String>, String> {
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

/// Opens a terminal on `session_id`'s window. Its output is held until `term_ready`, then comes
/// as `term://data/<id>` events (base64), and `term://exit/<id>` when the attach ends.
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
    let gate = Arc::new(Mutex::new(Gate::default()));
    let (data, exit) = (format!("term://data/{id}"), format!("term://exit/{id}"));
    let (out, done, held, gone) = (app.clone(), app, gate.clone(), id.clone());
    let term = spawn(
        &argv,
        cols,
        rows,
        move |chunk| {
            let mut gate = held.lock().unwrap();
            if !gate.ready {
                gate.held.extend_from_slice(chunk);
                return true;
            }
            out.emit(&data, base64::engine::general_purpose::STANDARD.encode(chunk)).is_ok()
        },
        move || {
            // The attach ended on its own (detached, killed): reap it and forget the terminal.
            if let Some(term) = done.state::<Terms>().take(&gone) {
                term.lock().unwrap().end();
            }
            let _ = done.emit(&exit, ());
        },
    )?;
    terms.open.lock().unwrap().insert(id.clone(), (Arc::new(Mutex::new(term)), gate));
    Ok(id)
}

/// The renderer listens now: what the terminal printed so far goes out, then the rest as it comes.
#[tauri::command]
pub fn term_ready(app: AppHandle, terms: State<Terms>, term_id: String) -> Result<(), String> {
    let (_, gate) = terms.get(&term_id)?;
    let mut gate = gate.lock().unwrap();
    if !gate.held.is_empty() {
        let held = std::mem::take(&mut gate.held);
        let _ = app.emit(&format!("term://data/{term_id}"), base64::engine::general_purpose::STANDARD.encode(held));
    }
    gate.ready = true;
    Ok(())
}

// Writes and resizes run off the main thread: a big paste into a full pty blocks until the
// agent reads, and must not freeze the window or the other terminals.
#[tauri::command]
pub async fn term_write(terms: State<'_, Terms>, term_id: String, data: String) -> Result<(), String> {
    let (term, _) = terms.get(&term_id)?;
    tauri::async_runtime::spawn_blocking(move || term.lock().unwrap().write(data.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
}

/// The pty's size; the window's own size is `mesa resize`, which the renderer calls after this.
#[tauri::command]
pub async fn term_resize(terms: State<'_, Terms>, term_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let (term, _) = terms.get(&term_id)?;
    tauri::async_runtime::spawn_blocking(move || term.lock().unwrap().resize(cols, rows))
        .await
        .map_err(|e| e.to_string())?
}

/// Kills the terminal's tmux client, outside every lock (portable-pty's kill waits a little);
/// the window and its agent keep running.
#[tauri::command]
pub async fn term_close(terms: State<'_, Terms>, term_id: String) -> Result<(), String> {
    let Some(term) = terms.take(&term_id) else { return Ok(()) };
    tauri::async_runtime::spawn_blocking(move || term.lock().unwrap().end())
        .await
        .map_err(|e| e.to_string())
}

/// Writes the macOS pasteboard: WKWebView refuses `navigator.clipboard` (SP-3), so OSC 52 copies
/// from tmux come here. (Paste is the webview's own: Cmd+V fires a paste event xterm handles.)
#[tauri::command]
pub async fn clipboard_write(text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut pbcopy = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        pbcopy.stdin.take().ok_or("no stdin")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        pbcopy.wait().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
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
    fn the_pty_takes_its_size_and_input_and_ends_when_asked() {
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let (exited_tx, exited) = mpsc::channel::<()>();
        // `stty size` prints rows and cols; `head -1` then echoes one typed line back.
        let argv = ["sh".to_string(), "-c".to_string(), "stty size; head -1; sleep 30".to_string()];
        let mut term = spawn(&argv, 100, 30, move |c| tx.send(c.to_vec()).is_ok(), move || {
            let _ = exited_tx.send(());
        })
        .expect("spawn sh");
        let mut seen = String::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut wait_for = |text: &str, seen: &mut String| {
            while !seen.contains(text) && std::time::Instant::now() < deadline {
                if let Ok(c) = rx.recv_timeout(Duration::from_millis(100)) {
                    seen.push_str(&String::from_utf8_lossy(&c));
                }
            }
        };
        wait_for("30 100", &mut seen);
        assert!(seen.contains("30 100"), "stty size said: {seen:?}");
        term.write(b"typed line\n").expect("write");
        wait_for("typed line\r\ntyped line", &mut seen);
        assert!(seen.contains("typed line\r\ntyped line"), "echo: {seen:?}");
        // end() kills and reaps the process mid-sleep, and the output stream ends.
        term.end();
        exited.recv_timeout(Duration::from_secs(5)).expect("the reader sees the end");
    }

    #[test]
    fn the_attach_argv_comes_from_the_envelope() {
        let ok = json!({"ok": true, "data": {"target": "p:w", "argv": ["tmux", "-L", "mesa-default", "attach-session"]}});
        assert_eq!(argv_of(&ok).unwrap(), ["tmux", "-L", "mesa-default", "attach-session"]);
        let gone = json!({"ok": false, "error": {"code": "not_found", "message": "session ended; use mesa resume"}});
        assert_eq!(argv_of(&gone).unwrap_err(), "session ended; use mesa resume");
        assert!(argv_of(&json!({"ok": true, "data": {}})).is_err());
    }
}
