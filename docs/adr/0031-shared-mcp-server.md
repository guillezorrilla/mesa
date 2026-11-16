# ADR-0031: One Shared MCP server a profile, reached through a relay

Status: accepted, amends ADR-0011 and ADR-0012
Date: 2026-11-16

## Context

ADR-0012 mounts mesa-vault, and beside it mesa-decisions (ADR-0019), on every Claude Code and Codex launch as `<mesa> vault mcp` and `<mesa> decisions mcp`, so each session runs two full `mesa` processes for its whole life. ADR-0011 has each one bind to its session through `MESA_SESSION_ID` and `MESA_PROFILE` in its environment. On the owner's Mac that was 37 such processes, about 52 MB footprint each and 1.9 GB in all, idle (docs/spikes/app-efficiency.md, #1229); on 2026-11-16 it was 34, 1,851 MB, 54.4 MB each. A relay through `nc -U` measured 1.4 MB.

## Decision

- **The Shared MCP server.** `mesa mcp serve` (`agents/shared-mcp.ts`) listens on the profile's `mcp.sock` (`ProfilePaths.mcpSocket`), in the profile's folder, which is 0700, so only its user connects. A connection's first line is its binding, `{"server":"vault"|"decisions","session":"<MESA_SESSION_ID>","profile":"<MESA_PROFILE>"}`; every line after it is that server's stdio protocol, served by the server's own command (`vault mcp` or `decisions mcp`, run in this process through `runCli` with `--profile` this profile's, and the binding's session and profile as `MESA_SESSION_ID` and `MESA_PROFILE`, an empty one unset). A first line that is no binding, or no line (a probe), closes the connection unserved. It exits, removing its socket, once 10 minutes pass with no connection open. A socket path over 100 bytes (macOS caps one at 104) is refused, and so is a second server where one answers; a socket file a dead server left is replaced.
- **ADR-0011's binding holds per connection.** The server's own binding check reads the connection's variables on every request, never the shared process's environment, so a binding without a live session of this profile is inert as before, and a session stopped while connected is refused from its next request.
- **The mount is a relay.** For per-launch agents (Claude Code, Codex) `mesaServer()` with the profile's socket is `/bin/sh -c '<script>' mesa-relay <socket> <server> <mesa argv...>`: when a plain `nc -U <socket> </dev/null` connects, the script pipes the binding line and then its stdin into `nc -U <socket>`; otherwise it execs the rest of its argv, today's per-session server, so nothing breaks while the shared server is down. Antigravity's single global entry is unchanged.
- **Lifecycle.** Every launch of a per-launch agent (`startSession`: open, resume, fork, adopt, handoff, a queued start) ensures the server runs: when nothing answers at the socket, it runs `mesa mcp serve` from the profile's tmux server (`runMesaLater`, `run-shell -b`), which outlives the mesa asking. A launch never fails over it.
- `mesa serve` (ADR-0030) still refuses a command that serves its own stdio; the Shared MCP server's own calls are the only ones let through (`rerun`'s `serves`).

`nc -zU` would be the natural probe, but macOS's `nc` exits 1 for it even on a live socket (tried on Darwin 25.3), so the relay probes with an empty connection instead.

## Evidence

The worktree's CLI under Node 24 (`node packages/cli/dist/mesa.js`), and the app's executable, on the owner's Mac with a throwaway profile under `~/.mesa/`, removed after. Five sessions, each with both servers, each having answered `initialize` and `tools/list`, then idle 3 s; `footprint -p` of every process:

| | Processes per session | Each | Five sessions |
| --- | --- | --- | --- |
| Before, app executable (`mesa vault mcp`, `mesa decisions mcp`) | 2 | 70.7 MB | 707 MB |
| Before, Node build | 2 | 94.0 MB | 940 MB |
| After, Node build: relays (`sh`, `cat`, `nc` per server) | 6 | 1.1, 0.9, 1.4 MB | 34 MB |
| After: the one shared server, for every session | | | 95 MB |

Fresh processes read more than the owner's 52 MB, which macOS had compressed while idle. At the owner's 17 sessions that is about 34 servers' 1.85 GB down to about 116 MB of relays and one server.

## Consequences

- Each session holds three small processes per server instead of one full mesa; the profile holds one more long-lived process, for as long as any session is connected.
- A crash of the shared server drops every session's mesa-vault and mesa-decisions at once (its relays end); the next launch starts a new one, and a session started meanwhile runs its own servers. Each connection's errors are caught and logged, so one connection's failure does not reach the others.
- A session started while no server answers yet (the first launch, or within the server's start-up) runs its own servers for its life.
- After an update the shared server is the old executable until it idles out or the tmux server ends.
- The relay adds about 380 bytes per server to an agent's launch command, out of the 12,000 Mesa passes to tmux.
