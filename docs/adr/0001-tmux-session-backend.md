# ADR-0001: tmux is the session backend

Status: accepted
Date: 2026-09-24

## Context

Sessions must survive the Electron app restarting or crashing, be reachable from a plain terminal, accept a prompt from the CLI (`mesa send`), show in an embedded terminal in the app, and expose an output tail when hooks do not fire. The alternative was node-pty alone, which ties every pty to the Electron process.

## Decision

Keep tmux. Mesa runs its own tmux server per profile so it never touches the user's tmux:

- socket: `tmux -L mesa-<profile>`
- session: one per project, named after the project
- window: one per agent session, named `<agent>-<shortid>` (for example `claude-a1b2c3`)
- per window: `remain-on-exit on` so a crashed agent leaves its output visible, `history-limit 10000`
- open: `new-session -d -s <project> -n <window> '<cmd>'` or `new-window -t <project> -n <window> '<cmd>'`, with `MESA_SESSION_ID` and `MESA_PROFILE` in the window environment
- stop: `kill-window -t <project>:<window>`
- send: `send-keys -t <target> -l '<text>'` then a second call `send-keys -t <target> Enter`; check `pane_current_command` first so text is not typed into a shell after the agent exited
- tail: `capture-pane -p -t <target> -S -<N>`; `pipe-pane -o 'cat >> <file>'` when continuous logging is on
- attach (embedded terminal and `mesa attach`): `attach-session -t <target> -f ignore-size` so the app and a user terminal do not fight over pane size
- list: `list-windows -t <project> -F '#{window_index} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{window_activity} #{pane_dead}'`
- `TERM=tmux-256color` inside windows

## Evidence

docs/research/sources/tmux-vs-node-pty.md: tmux 3.7c man page and a live smoke test on a throwaway socket, accessed 2026-09-24. A node-pty daemon with attach protocol, IPC, and scrollback storage was estimated at 55 to 95 agent hours to reach parity.

## Consequences

- tmux is a runtime dependency (Homebrew). `mesa doctor` checks for it.
- tmux does not survive logout or reboot. Session records in `~/.mesa/<profile>/sessions/` do, and `mesa resume` recreates the window with the agent's own resume command.
- Mouse and TERM behaviour were verified against a plain shell only; the P0 terminal spike verifies the Claude Code and Codex TUIs inside tmux inside xterm.

## Amendment 2026-09-24: liveness before send is `pane_dead`, not `pane_current_command`

docs/spikes/session-ids.md (issue #7, Claude Code 2.1.281 in a tmux window) shows `pane_current_command` reads the version string (`2.1.281`) while claude runs, never `claude`, so the `send` check above never matches a live agent. With `remain-on-exit on` an exited agent leaves a dead pane rather than a shell, so `mesa send` checks `pane_dead` is 0 instead. The spike also recommends `focus-events on` on the Mesa server, since claude warns when it is off.

## Amendment 2026-09-25: how the backend drives the server

Issue #17 built the backend (`packages/core/src/sessions/tmux.ts`). Choices the text above left open:

- Every call is `tmux -L mesa-<profile> -f /dev/null ...`, so the user's `~/.tmux.conf` (`base-index`, `remain-on-exit`, key bindings) never changes what Mesa sees. A user attached to a Mesa window gets tmux's default bindings.
- The server starts with `exit-empty off`: it outlives its last window and keeps Mesa's options (`remain-on-exit on`, `history-limit 10000`, `default-terminal tmux-256color`, `focus-events on`) until `kill-server` or logout. The options are global, so every window inherits them, and each open sets them again.
- The server drops `CLAUDECODE`, `CLAUDE_CODE_*`, and `CLAUDE_PID` from its global environment (docs/spikes/session-ids.md), so a claude started by a mesa that runs inside Claude Code does not see itself as nested.
- Targets are exact, `=<project>:=<window>`: tmux otherwise matches a prefix, and in a live check `tide:claude-aaaaaa` reached the window in `tide-pool`.
- `list-windows` separates the fields above with tabs and puts `#{session_name}` first for `-a`, so a path with spaces parses.
- `send` always refuses a dead pane, and refuses a pane running a shell unless forced.

Evidence: live checks with tmux 3.7c on a throwaway socket (2026-09-25), kept as `packages/core/src/sessions/tmux.test.ts`.
