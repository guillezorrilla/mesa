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
