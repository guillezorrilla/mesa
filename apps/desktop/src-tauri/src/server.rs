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

/// The calls waiting for a reply; None once the server's stdout has ended, so no call can wait on
/// a server that will never answer.
type Waiting = Arc<Mutex<Option<HashMap<u64, Sender<Reply>>>>>;

/// The running server: where requests go, and the calls waiting for a reply.
struct Live {
    child: Child,
    stdin: ChildStdin,
    waiting: Waiting,
}

impl Drop for Live {
    /// Reaped, so a replaced server leaves no zombie.
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct Server {
    start: fn() -> Result<Command, String>,
    live: Mutex<Option<Live>>,
    next_id: AtomicU64,
    /// Set when a server ends without answering anything (a mesa without `serve`): spawn from then on.
    broken: Arc<AtomicBool>,
}

impl Server {
    pub fn new(start: fn() -> Result<Command, String>) -> Self {
        Server {
            start,
            live: Mutex::new(None),
            next_id: AtomicU64::new(1),
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
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel();
        {
            let mut live = self.live.lock().ok()?;
            // Ended means its reader is done, `broken` already settled: restart unless it is.
            let ended = live
                .as_ref()
                .is_none_or(|l| l.waiting.lock().map_or(true, |w| w.is_none()));
            if ended {
                if self.broken.load(Ordering::Relaxed) {
                    return None;
                }
                *live = Some(self.spawn().ok()?);
            }
            let server = live.as_mut()?;
            // Closed since: nothing was written, so the caller may spawn it.
            server.waiting.lock().ok()?.as_mut()?.insert(id, tx);
            let line = json!({ "id": id, "args": args, "stdin": stdin }).to_string() + "\n";
            if server
                .stdin
                .write_all(line.as_bytes())
                .and_then(|_| server.stdin.flush())
                .is_err()
            {
                // Its stdin is closed, so it never read this; its reader closes `waiting`.
                if let Some(w) = server.waiting.lock().ok()?.as_mut() {
                    w.remove(&id);
                }
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
        let waiting: Waiting = Arc::new(Mutex::new(Some(HashMap::new())));
        let (pending, broken) = (waiting.clone(), self.broken.clone());
        std::thread::spawn(move || {
            let mut answered = false;
            // Bytes, not lines of text: one line that is not UTF-8 is skipped, not the end.
            for line in BufReader::new(stdout).split(b'\n').map_while(Result::ok) {
                let Ok(reply) = serde_json::from_slice::<Reply>(&line) else {
                    continue;
                };
                let Some(id) = reply.id else { continue };
                answered = true;
                let tx = pending
                    .lock()
                    .ok()
                    .and_then(|mut w| w.as_mut()?.remove(&id));
                if let Some(tx) = tx {
                    let _ = tx.send(reply);
                }
            }
            // Under the lock that closes `waiting`, so a call that finds it closed sees `broken`.
            if let Ok(mut w) = pending.lock() {
                if !answered {
                    broken.store(true, Ordering::Relaxed);
                }
                // Dropping every waiting sender gives each call in flight its error.
                *w = None;
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
        assert!(server.call(&["x".into()], None).is_none());
    }

    #[test]
    fn a_server_that_ends_after_answering_is_started_again() {
        let server = Server::new(|| {
            let mut cmd = Command::new("/bin/sh");
            cmd.arg("-c").arg(
                r#"read -r line; id=$(printf '%s' "$line" | sed 's/.*"id":\([0-9]*\).*/\1/')
                   printf '{"id":%s,"code":0,"stdout":"{\\"ok\\":true,\\"data\\":1}","stderr":""}\n' "$id""#,
            );
            Ok(cmd)
        });
        assert!(server.call(&["x".into()], None).unwrap().is_ok());
        // Each later call gets a fresh server's answer, an in-flight error, or a spawn; never a hang.
        for _ in 0..5 {
            let later = server.call(&["x".into()], None);
            assert!(
                !matches!(later, Some(Ok(ref v)) if v["ok"] != true),
                "{later:?}"
            );
        }
        assert!(!server.broken.load(std::sync::atomic::Ordering::Relaxed));
    }

    #[test]
    fn a_server_that_cannot_start_hands_the_call_back() {
        let server = Server::new(|| Ok(Command::new("/nonexistent/mesa")));
        assert!(server.call(&["x".into()], None).is_none());
    }
}
