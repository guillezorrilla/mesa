# ADR-0032: `mesa` starts forward their call to the Command server's socket

Status: accepted, amends ADR-0030
Date: 2026-11-16

## Context

ADR-0030 gave the app one long-lived `mesa serve`, but everything else that runs the CLI still starts a process that loads all of `@mesa/core` before it reads its argv: about 0.11 CPU-s, 1.5 G instructions and 115 MB for each `mesa` call on a release build. `mesa hook claude` runs at least twice per tool call in every Claude session (p90 17 events a minute on the owner's profile, peak 62), and agents now call `mesa vault ...` in place of the MCP tools (#1239), so these starts add up (docs/spikes/app-efficiency.md, rank 3).

orca (stablyai/orca) keeps its CLI thin: it parses argv, then sends one request over a unix socket to the running app, after checking the socket's folder is private, with a size cap. Mesa must also keep working with the app closed: sessions run in tmux without it.

## Decision

- While `mesa serve` serves its stdio, it also listens on the profile's Command socket, `~/.mesa/<profile>/run/serve.sock` (`ProfilePaths.commandSocket`). The folder is made 0700 and the socket 0600; a path over 103 bytes (sun_path) gets no socket. A socket a dead server left is replaced; one a live server answers on is kept, so the first server of a profile answers and a second logs why it has none.
- One call a connection, one JSON message a line each way. The client sends `{"version","argv","cwd","env","startedAt"}`, its whole environment and when its process started. The server runs it with the same `runCli` path as a stdio request, in the caller's environment, folder and start time (the runner and spawner get the caller's environment too, so children see what they would in process). It asks for stdin with `{"stdin":true}` only when the command reads it, and the client answers `{"stdin":"..."}`; it then replies `{"code","stdout","stderr","exec"?}` and ends the connection. A connection past 64 MiB is cut.
- The `mesa` entrypoint tries the socket before it imports core, with Node builtins, `@mesa/core/paths` and the CLI's version and global flags only: it resolves the profile from `--profile` and `MESA_PROFILE`, checks the socket's folder is a directory this user owns with no group or other bits, and forwards. It prints the reply as an in-process run would: the same stdout, stderr and exit code, and an `exec` reply is executed by the caller. It runs the call itself when stdin is a terminal (only it can ask the person), when no server answers, when the folder is not private, or when the server answers `{"here":true}`: the server's version differs from the client's, or the command serves (`Command.serves`: `serve`, `host`, the MCP servers, `chat --follow`, and now `phone serve`, which runs until stopped). A connection lost after the call was sent fails with exit 1, as a call may have run; a hook's is run again in process, as a lost event costs more than one recorded twice.
- Hooks keep their installed command, `mesa hook claude`, and take the same Node fast path. Skipping Node (a POSIX sh script sending the payload with `nc -U`) measured far cheaper, but it would have to escape the payload and the caller's folder into JSON and parse a reply's exit code, stdout and stderr back out in sh, where a slip loses an event or a guardrail's block (exit 2); it stays a measured option for later.

## Evidence

Release-style single executables built as `scripts/release/build.sh` does (esbuild bundle, Node 26.10.0 from nodejs.org checked against its pinned sha, code cache, arm64), before (main at 1e259690) and after, under `/usr/bin/time -l`, median of 15 runs, throwaway `HOME` and profile, Apple Silicon:

| Command | Before | After, no server | After, server running |
| --- | --- | --- | --- |
| `mesa --version` | 0.10 CPU-s, 110 MB, 1.27 G instr | 0.10 s, 110 MB, 1.27 G | 0.03 s, 90 MB, 0.60 G |
| `mesa vault search x --json` | 0.11 s, 115 MB, 1.50 G | 0.12 s, 115 MB, 1.50 G | 0.03 s, 91 MB, 0.59 G |
| `mesa hook claude` (PostToolUse) | 0.12 s, 117 MB, 1.54 G | 0.12 s, 117 MB, 1.55 G | 0.03 s, 90 MB, 0.61 G |

For the hook decision: `sh` reading the payload and `nc -U` sending it to the socket took 0.024 G instructions and 2.8 MB; a bare `node -e 0` of the same Node takes 0.26 G and 51 MB. What remains of the fast path's 90 MB is the single executable mapping its bundle and code cache.

## Consequences

- A `mesa` call from an agent or a hook costs about a quarter of the CPU while the app runs, and nothing more when it does not (the probe is one `lstat`).
- Forwarded calls run in the app's server beside the app's own: one that blocks its event loop delays the others, and a crash of the server fails the calls in flight with it (ADR-0030's consequences, now for agents' calls too). A call that waits (`mesa wait`) holds a connection, not a process.
- Calls forwarded record the server's process id where a lock or listener records its owner's; each releases it when the call ends, as calls of the stdio server already did.
- Any process of this user that can reach the socket runs `mesa` commands as this user, as it could by running `mesa`; the private folder keeps every other user out.
- A client and a server of different versions never mix: after an update, calls run in process until the app restarts its server.
