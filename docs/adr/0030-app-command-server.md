# ADR-0030: The app sends its commands to one long-lived mesa serve

Status: accepted, amends ADR-0007
Date: 2026-11-16

## Context

ADR-0007 has `run_mesa` spawn the CLI once per call. Each spawn of the bundled executable (ADR-0017) loads all of `@mesa/core` before it reads its argv: 0.17 CPU-s and 131 MB for `mesa --version`. A hook event, or the fallback poll (#895), fans out to about five calls in the renderer (`sessions.list`, `phone.push`, `notifications.claimDelivery`, `queue.list`, `sessions.chat`), so one look cost about 1.4 CPU-s in five processes of 130 to 250 MB, 0.85 s of it start-up. On the owner's Mac that was about 60 process starts and 17 CPU-s a minute when quiet, and about a core when sessions were busy (docs/spikes/app-efficiency.md, #1227).

`runCli` already turns an argv into `{code, stdout, stderr}` over injected deps (ADR-0008), and core reads no process globals, keeps no mutable module state, and writes nothing to stdout itself, so one process can run many calls, several at once.

## Decision

- `mesa serve` is the Command server. It reads one JSON request a line on stdin, `{"id","args","stdin"}`, runs it with `runCli` exactly as a spawn of `mesa <args>` would (no terminal, no one to ask, the request's stdin, the request's argv, its start time now), and writes one reply a line, `{"id","code","stdout","stderr"}`, when that call ends. Calls overlap and answer in any order; a line that is no request gets a reply with id null. It ends when stdin closes and every call has answered.
- `run_mesa` (`src-tauri/src/server.rs`) starts one `mesa serve` on its first call, with the same command, environment and `MESA_CLI` override a spawn uses, writes each call to it, and waits for the reply with that id. A call that never reached a server (it cannot start, or its stdin is closed) is spawned as before. A call in flight when the server exits fails with an error rather than being run again, since it may already have acted. The next call starts a new server. A server that ends without answering anything (a mesa without `serve`) is not started again, and every later call spawns.
- Everything else that runs the CLI keeps spawning: the agents' hooks, tmux's pane-died hook, the notification helper, the updater and the terminal's attach.

## Evidence

The same esbuild bundle of the CLI under Node 24, against the owner's profile (14 sessions, 46 board rows), 10 looks of `sessions --tree --full`, `queue list <id>` and `sessions --archived --full` (`docs/spikes/app-efficiency.md`, `bench.py`):

| | Processes | CPU (incl. children) | Peak RSS |
| --- | --- | --- | --- |
| A spawn per call | 30 | 16.3 s | 221 MB each |
| One `mesa serve` | 1 | 7.8 to 9.9 s | 288 to 304 MB, held |

What remains is mostly children: the Claude listing runs on every look over idle sessions (#1228).

## Consequences

- The app holds one more process for its life, about 300 MB at its peak, in place of five short ones a look of up to 250 MB each.
- A command that blocks its event loop delays the calls beside it; core's runner and file reads are asynchronous or short.
- A crash in one call's code that takes down the process fails the calls in flight with it; the next call starts a new server.
- After an update the server is the old executable until the app restarts, as every child of the app already was.
