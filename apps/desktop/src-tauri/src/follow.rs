//! A Structured session's live chat (ADR-0029): while its chat is open, one `mesa chat <id>
//! --follow` runs and each JSON line it prints reaches the renderer as a `follow://line/<id>`
//! event, so a reply shows as it is written with no CLI call per refresh. A follow that ends
//! without its `end` line (it crashed, mesa was updated) starts again after a back-off; closing the
//! chat or quitting the app kills it.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::bridge;
use crate::gate::Gate;

/// How many starts in a row may fail (mesa missing, say) before a follow gives up.
const MAX_FAILED_STARTS: u32 = 5;

/// The first wait before a follow that ended starts again, doubled each time up to MAX_BACKOFF,
/// and back to the first once a follow has run for STEADY.
const FIRST_BACKOFF: Duration = Duration::from_millis(500);
const MAX_BACKOFF: Duration = Duration::from_secs(10);
const STEADY: Duration = Duration::from_secs(30);

/// One open chat's follow: its current process, and whether the chat closed.
#[derive(Default)]
pub struct Follow {
    closed: AtomicBool,
    child: Mutex<Option<Child>>,
    /// Its lines, held until the renderer listens (gate.rs).
    gate: Mutex<Gate<String>>,
}

impl Follow {
    /// Ends it for good: no restart, and its process killed and reaped.
    fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().unwrap().take() {
            kill_group(&mut child);
        }
    }
}

/// Kills `child`'s whole process group and reaps it: a mesa run through a wrapper leaves a child
/// that would hold stdout open. shortcut: `/bin/kill` rather than a libc dependency for one call.
fn kill_group(child: &mut Child) {
    let _ = std::process::Command::new("/bin/kill")
        .args(["-KILL", &format!("-{}", child.id())])
        .status();
    let _ = child.kill();
    let _ = child.wait();
}

/// Every open chat's follow, by id.
#[derive(Default)]
pub struct Follows {
    next: AtomicU32,
    open: Mutex<HashMap<String, Arc<Follow>>>,
}

impl Follows {
    /// Kills every follow: the app is quitting.
    pub fn close_all(&self) {
        for (_, follow) in self.open.lock().unwrap().drain() {
            follow.close();
        }
    }
}

/// Runs `argv` (after mesa's own command) until it ends, sending each line to `on_line`; whether
/// it printed its `end` line. Tauri-free, so `cargo test` drives it.
fn run_once(
    follow: &Follow,
    command: std::process::Command,
    on_line: &mut impl FnMut(String),
) -> Result<bool, String> {
    let mut command = command;
    // Its own process group, so a close kills whatever it started too (kill_group).
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command
        // Kept open: a follow ends when its stdin closes, which is the app going away.
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot start mesa: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    {
        let mut slot = follow.child.lock().unwrap();
        if follow.closed.load(Ordering::SeqCst) {
            kill_group(&mut child);
            return Ok(true);
        }
        *slot = Some(child);
    }
    let mut ended = false;
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        ended = serde_json::from_str::<serde_json::Value>(&line).is_ok_and(|v| v["type"] == "end");
        on_line(line);
    }
    if let Some(mut child) = follow.child.lock().unwrap().take() {
        let _ = child.wait();
    }
    Ok(ended)
}

/// Follows `args` with `on_line` for every line, starting again with back-off until it prints
/// `end` or `follow` closes; `command` makes each process.
fn keep_following(
    follow: &Follow,
    command: impl Fn() -> Result<std::process::Command, String>,
    mut on_line: impl FnMut(String),
    sleep: impl Fn(Duration),
) {
    let mut backoff = FIRST_BACKOFF;
    let mut failed = 0;
    while !follow.closed.load(Ordering::SeqCst) {
        let started = Instant::now();
        let ended = match command().and_then(|c| run_once(follow, c, &mut on_line)) {
            Ok(ended) => {
                failed = 0;
                ended
            }
            // One that cannot start at all is given up after a few tries, not retried forever.
            Err(_) if failed + 1 >= MAX_FAILED_STARTS => return,
            Err(_) => {
                failed += 1;
                false
            }
        };
        if ended || follow.closed.load(Ordering::SeqCst) {
            return;
        }
        if started.elapsed() >= STEADY {
            backoff = FIRST_BACKOFF;
        }
        sleep(backoff);
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

/// Starts following `session_id`'s chat, its newest `count` replies first. Lines are held until
/// `follow_ready`, then come as `follow://line/<id>` events (each one JSON line of `mesa chat
/// --follow`); `follow://exit/<id>` when it ends for good.
#[tauri::command]
pub fn follow_open(
    app: AppHandle,
    follows: State<'_, Follows>,
    session_id: String,
    count: u32,
) -> Result<String, String> {
    let id = format!("f{}", follows.next.fetch_add(1, Ordering::Relaxed) + 1);
    let follow = Arc::new(Follow::default());
    follows
        .open
        .lock()
        .unwrap()
        .insert(id.clone(), follow.clone());
    let (line_event, exit_event) = (format!("follow://line/{id}"), format!("follow://exit/{id}"));
    let gone = id.clone();
    std::thread::spawn(move || {
        let args = [
            "chat",
            "--follow",
            "--count",
            &count.to_string(),
            "--",
            &session_id,
        ]
        .map(String::from);
        let emitter = app.clone();
        let gated = follow.clone();
        keep_following(
            &follow,
            || {
                let mut cmd = bridge::mesa_command(std::env::var_os("MESA_CLI"))?;
                cmd.args(&args);
                Ok(cmd)
            },
            move |line| {
                gated
                    .gate
                    .lock()
                    .unwrap()
                    .pass(line, |l| emitter.emit(&line_event, l).is_ok());
            },
            std::thread::sleep,
        );
        // Ended for good (its `end`, or it could not start): the renderer may open another.
        app.state::<Follows>().open.lock().unwrap().remove(&gone);
        let _ = app.emit(&exit_event, ());
    });
    Ok(id)
}

/// The renderer listens now: the lines held so far go out, then the rest as they come.
#[tauri::command]
pub fn follow_ready(
    app: AppHandle,
    follows: State<'_, Follows>,
    follow_id: String,
) -> Result<(), String> {
    let follow = follows
        .open
        .lock()
        .unwrap()
        .get(&follow_id)
        .cloned()
        .ok_or("no such follow")?;
    for line in follow.gate.lock().unwrap().open() {
        let _ = app.emit(&format!("follow://line/{follow_id}"), line);
    }
    Ok(())
}

/// Ends a chat's follow and kills its process, off the main thread.
#[tauri::command]
pub async fn follow_close(follows: State<'_, Follows>, follow_id: String) -> Result<(), String> {
    let Some(follow) = follows.open.lock().unwrap().remove(&follow_id) else {
        return Ok(());
    };
    tauri::async_runtime::spawn_blocking(move || follow.close())
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn sh(script: &str) -> Result<Command, String> {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", script]);
        Ok(cmd)
    }

    #[test]
    fn a_follow_passes_each_line_and_stops_at_its_end_line() {
        let follow = Follow::default();
        let mut lines = Vec::new();
        keep_following(
            &follow,
            || sh(r#"echo '{"type":"chat"}'; echo; echo '{"type":"end"}'"#),
            |line| lines.push(line),
            |_| panic!("a follow that ended is not started again"),
        );
        assert_eq!(lines, [r#"{"type":"chat"}"#, r#"{"type":"end"}"#]);
    }

    #[test]
    fn a_follow_that_dies_starts_again_with_a_growing_back_off() {
        let follow = Follow::default();
        let runs = AtomicU32::new(0);
        let waits = Mutex::new(Vec::new());
        keep_following(
            &follow,
            || {
                // The third run ends properly.
                let n = runs.fetch_add(1, Ordering::SeqCst);
                sh(if n < 2 {
                    "echo '{\"type\":\"chat\"}'"
                } else {
                    "echo '{\"type\":\"end\"}'"
                })
            },
            |_| {},
            |wait| waits.lock().unwrap().push(wait),
        );
        assert_eq!(runs.load(Ordering::SeqCst), 3);
        assert_eq!(*waits.lock().unwrap(), [FIRST_BACKOFF, FIRST_BACKOFF * 2]);
    }

    #[test]
    fn a_follow_that_cannot_start_gives_up_after_a_few_tries() {
        let follow = Follow::default();
        let tries = AtomicU32::new(0);
        keep_following(
            &follow,
            || {
                tries.fetch_add(1, Ordering::SeqCst);
                Err("cannot start mesa".to_string())
            },
            |_| {},
            |_| {},
        );
        assert_eq!(tries.load(Ordering::SeqCst), MAX_FAILED_STARTS);
    }

    #[test]
    fn closing_a_follow_kills_its_process_and_starts_no_other() {
        let follow = Arc::new(Follow::default());
        let running = follow.clone();
        let started = Instant::now();
        let thread = std::thread::spawn(move || {
            keep_following(
                &running,
                || sh("echo '{\"type\":\"chat\"}'; sleep 30"),
                |_| {},
                |_| {},
            );
        });
        while follow.child.lock().unwrap().is_none() {
            std::thread::sleep(Duration::from_millis(10));
        }
        follow.close();
        thread.join().unwrap();
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "the sleep was killed"
        );
    }

    #[test]
    #[ignore = "live: MESA_FOLLOW_SESSION names a running Structured session of MESA_PROFILE"]
    fn twenty_chats_opened_and_closed_leave_no_follow_running() {
        let session = std::env::var("MESA_FOLLOW_SESSION").expect("MESA_FOLLOW_SESSION");
        for _ in 0..20 {
            let follow = Arc::new(Follow::default());
            let running = follow.clone();
            let id = session.clone();
            let (tx, rx) = std::sync::mpsc::channel::<String>();
            let thread = std::thread::spawn(move || {
                keep_following(
                    &running,
                    || {
                        let mut cmd = bridge::mesa_command(None)?;
                        cmd.args(["chat", "--follow", "--", &id]);
                        Ok(cmd)
                    },
                    move |line| {
                        let _ = tx.send(line);
                    },
                    std::thread::sleep,
                );
            });
            let first = rx
                .recv_timeout(Duration::from_secs(20))
                .expect("the chat line");
            assert!(first.contains(r#""type":"chat""#), "first line: {first}");
            follow.close();
            thread.join().unwrap();
        }
        std::thread::sleep(Duration::from_millis(500));
        let left = Command::new("pgrep")
            .args(["-f", &format!("chat --follow -- {session}")])
            .output()
            .expect("pgrep");
        assert!(
            left.stdout.is_empty(),
            "left running: {}",
            String::from_utf8_lossy(&left.stdout)
        );
    }
}
