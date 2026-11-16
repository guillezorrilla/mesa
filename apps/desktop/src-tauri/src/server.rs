//! The Command server (ADR-0030): one long-lived `mesa serve` the app sends its calls to, so a call
//! no longer pays the CLI's start-up. Spawning per call (bridge.rs) stays the fallback.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Deserialize;
use serde_json::{json, Value};

/// One call's reply: its exit code and streams, as a spawn of it would give them.
#[derive(Deserialize)]
struct Reply {
    id: Option<u64>,
    code: i32,
    stdout: String,
    stderr: String,
}

type Waiting = Arc<Mutex<HashMap<u64, Sender<Reply>>>>;

/// The running server: where requests go, and the calls waiting for a reply.
struct Live {
    child: Child,
    stdin: ChildStdin,
    waiting: Waiting,
}

pub struct Server {
    start: fn() -> Result<Command, String>,
    live: Mutex<Option<Live>>,
    next: AtomicU64,
    /// Set when a server ends without answering anything (a mesa without `serve`): spawn from then on.
    broken: Arc<AtomicBool>,
}

impl Server {
    pub fn new(start: fn() -> Result<Command, String>) -> Self {
        Server {
            start,
            live: Mutex::new(None),
            next: AtomicU64::new(1),
            broken: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Sends `args` (and `stdin`) to the server, started or restarted as needed, and waits for its
    /// envelope. None when the request never reached a server, so the caller can safely spawn
    /// instead; an error when the server ended with the call in flight, which is not re-run since
    /// it may have acted.
    pub fn call(&self, args: &[String], stdin: Option<&str>) -> Option<Result<Value, String>> {
        if self.broken.load(Ordering::Relaxed) {
            return None;
        }
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel();
        {
            let mut live = self.live.lock().ok()?;
            if !live
                .as_mut()
                .is_some_and(|l| matches!(l.child.try_wait(), Ok(None)))
            {
                *live = Some(self.spawn().ok()?);
            }
            let server = live.as_mut()?;
            server.waiting.lock().ok()?.insert(id, tx);
            let line = json!({ "id": id, "args": args, "stdin": stdin }).to_string() + "\n";
            if server
                .stdin
                .write_all(line.as_bytes())
                .and_then(|_| server.stdin.flush())
                .is_err()
            {
                server.waiting.lock().ok()?.remove(&id);
                *live = None;
                return None;
            }
        }
        Some(match rx.recv() {
            Ok(reply) => crate::bridge::interpret(
                Some(reply.code),
                reply.stdout.as_bytes(),
                reply.stderr.as_bytes(),
            ),
            Err(_) => Err("mesa serve exited before it answered".to_string()),
        })
    }

    fn spawn(&self) -> Result<Live, String> {
        let mut child = (self.start)()?
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("cannot start mesa serve: {e}"))?;
        let stdin = child.stdin.take().ok_or("mesa serve has no stdin")?;
        let stdout = child.stdout.take().ok_or("mesa serve has no stdout")?;
        let waiting: Waiting = Arc::default();
        let (pending, broken) = (waiting.clone(), self.broken.clone());
        std::thread::spawn(move || {
            let mut answered = false;
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(reply) = serde_json::from_str::<Reply>(&line) else {
                    continue;
                };
                let Some(id) = reply.id else { continue };
                answered = true;
                if let Some(tx) = pending.lock().ok().and_then(|mut w| w.remove(&id)) {
                    let _ = tx.send(reply);
                }
            }
            if !answered {
                broken.store(true, Ordering::Relaxed);
            }
            // Its end drops every waiting sender, so each call in flight gets its error.
            if let Ok(mut w) = pending.lock() {
                w.clear();
            }
        });
        Ok(Live {
            child,
            stdin,
            waiting,
        })
    }
}

/// `mesa <args>` through the app's Command server, else spawned (bridge.rs).
pub fn run(args: &[String], stdin: Option<&str>) -> Result<Value, String> {
    static SERVER: OnceLock<Server> = OnceLock::new();
    let server = SERVER.get_or_init(|| {
        Server::new(|| {
            let mut cmd = crate::bridge::mesa_command(std::env::var_os("MESA_CLI"))?;
            cmd.arg("serve");
            Ok(cmd)
        })
    });
    server
        .call(args, stdin)
        .unwrap_or_else(|| crate::bridge::run(args, stdin))
}

#[cfg(test)]
mod tests {
    use super::Server;
    use std::process::Command;

    /// A server that answers each request with its id as the data.
    fn echo() -> Result<Command, String> {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(
            r#"while read -r line; do
                 id=$(printf '%s' "$line" | sed 's/.*"id":\([0-9]*\).*/\1/')
                 printf '{"id":%s,"code":0,"stdout":"{\\"ok\\":true,\\"data\\":%s}","stderr":""}\n' "$id" "$id"
               done"#,
        );
        Ok(cmd)
    }

    #[test]
    fn each_call_gets_its_own_reply_from_one_server() {
        let server = Server::new(echo);
        let first = server
            .call(&["--json".into(), "sessions".into()], None)
            .unwrap()
            .unwrap();
        let second = server
            .call(&["--json".into(), "doctor".into()], Some("key"))
            .unwrap()
            .unwrap();
        assert_eq!(
            (first["data"].as_u64(), second["data"].as_u64()),
            (Some(1), Some(2))
        );
        let pid = server.live.lock().unwrap().as_ref().unwrap().child.id();
        server.call(&["x".into()], None).unwrap().unwrap();
        assert_eq!(
            server.live.lock().unwrap().as_ref().unwrap().child.id(),
            pid
        );
    }

    #[test]
    fn a_server_that_never_answers_hands_calls_back_to_spawn() {
        let server = Server::new(|| Ok(Command::new("/usr/bin/true")));
        // Ended with the call in flight (an error, not a second run), or before it was written.
        let first = server.call(&["x".into()], None);
        assert!(matches!(first, Some(Err(_)) | None), "{first:?}");
        for _ in 0..100 {
            if server.broken.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        // Answered nothing, so it is never started again: the caller spawns.
        assert!(server.call(&["x".into()], None).is_none());
    }

    #[test]
    fn a_server_that_cannot_start_hands_the_call_back() {
        let server = Server::new(|| Ok(Command::new("/nonexistent/mesa")));
        assert!(server.call(&["x".into()], None).is_none());
    }
}
