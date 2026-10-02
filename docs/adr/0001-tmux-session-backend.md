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

Issue #17 built the backend (`packages/core/src/sessions/tmux/backend.ts`). Choices the text above left open:

- Every call is `tmux -L mesa-<profile> -f /dev/null ...`, so the user's `~/.tmux.conf` (`base-index`, `remain-on-exit`, key bindings) never changes what Mesa sees. A user attached to a Mesa window gets tmux's default bindings.
- The server starts with `exit-empty off`: it outlives its last window and keeps Mesa's options (`remain-on-exit on`, `history-limit 10000`, `default-terminal tmux-256color`, `focus-events on`) until `kill-server` or logout. The options are global, so every window inherits them, and each open sets them again.
- The server drops `CLAUDECODE`, `CLAUDE_CODE_*`, and `CLAUDE_PID` from its global environment (docs/spikes/session-ids.md), so a claude started by a mesa that runs inside Claude Code does not see itself as nested.
- Targets are exact, `=<project>:=<window>`: tmux otherwise matches a prefix, and in a live check `tide:claude-aaaaaa` reached the window in `tide-pool`.
- `list-windows` separates the fields above with tabs and puts `#{session_name}` first for `-a`, so a path with spaces parses.
- `send` always refuses a dead pane, and refuses a pane running a shell unless forced.

Evidence: live checks with tmux 3.7c on a throwaway socket (2026-09-25), kept as `packages/core/src/sessions/tmux/backend.test.ts`.

## Amendment 2026-09-25: windows are named after the Mesa session id

Issue #19 names a window `<agent>-<Mesa session id>` (`claude-a1b2c3d4`), not after the first characters of the agent session id as docs/spikes/session-ids.md suggested. A resume keeps the agent session id but gets a new Mesa session id (#20), so the resumed window never takes the old window's name, and `mesa sessions` never mistakes one session's window for another's.

Evidence: docs/spikes/session-ids.md (`mesa resume` reopens `claude-<shortid>` with the same agent session id) and issue #19's review, which found the resumed window would share the old one's name.

## Amendment 2026-09-25: stop is polite first

Issue #20: `mesa stop` presses Escape, waits 300 ms, types the agent's quit command (`/exit`, then Enter), and waits up to 5 s for the pane to die or the window to vanish before `kill-window`; `--force` goes straight to `kill-window`. Escape comes first so a pending permission prompt is dismissed (a denial) and never answered by the Enter; the pause keeps a TUI from reading Escape and `/` as one Alt key. Checked live against Claude Code 2.1.282 at its prompt: it quit within a second.

## Amendment 2026-09-25: ignore-size does not stop size fights (#8)

SP-3 measured it: an `-f ignore-size` client is skipped only while a client without the flag is attached. When the app and `mesa attach` both carry the flag, tmux sizes the window to the latest client, as `window-size latest` does. So the app sizes the window after each fit, as Xirp does: `resize-window` applies the view's size at once, then `set -w -u window-size` hands sizing back to `latest`. From then on the client used last (attached or typed in) sizes the window, which is the view in use. The #28 review measured this with two `ignore-size` clients: the unset returned the window to the latest client's size straight away. `mesa attach` keeps the flag.

## Amendment 2026-09-25: a view session per terminal (#28)

One tmux session per project holds every Mesa session's window. So attaching a terminal to `project:window` changes that session's current window, and every terminal attached to the project follows it. The #28 review saw two app panels both show the last window attached, with input reaching the wrong agent. Each terminal (the app's, and `mesa attach` in the user's) now makes its own view:

- `new-session -t =<project> -s _view-<id>`: grouped, so it has the same windows but its own current window;
- `set-option destroy-unattached on`: tmux removes the view when the terminal detaches;
- `select-window -t =_view-<id>:=<window>`.

Views are hidden from window listings. When a window is killed (stop, resume), a view on it moves to another window of the group, so the app closes a session's panel once the session is no longer live. `-f ignore-size` went with `attach-session`, which was of no use anyway (amendment above).

## Amendment 2026-09-26: the server runs a hook (#68)

Mesa's server now also runs `mesa hook tmux pane-died` whenever a pane dies. `ensureServer` sets that hook with the other options, and a look at a board with sessions sets it again without starting a server. ADR-0003's amendment of the same date gives the rules.

## Amendment 2026-09-26: a project view nests a terminal per session (#134)

A tmux layout arranges the panes of one window, and Mesa gives each session its own single-pane window, so `tmux.layout` had nothing to arrange. The owner chose a view of the project's sessions as the panes of one window (#134). Moving the sessions' panes into one window (`join-pane`) would break a window per session, which the board, stop, and resume read, so the window stays and the view shows it:

- `openView` makes a detached session `_view-<id>` with one window; each pane runs `unset TMUX; exec <tmux argv>`, a single-window view nested in the pane. Since #151, its client creates an independent session with a temporary window, sets `destroy-unattached on`, and replaces the temporary window with `link-window -k -s =<project>:=<window> -t =_view-<id>:0`. The temporary command is `true`, with `remain-on-exit off` only on its temporary window, so a window that disappears before the link ends the client too. Unlike `mesa attach`'s grouped view (above), this session holds only the linked window. When stop, resume, or removal kills it, tmux destroys the single-window session and its client exits, leaving a dead or closed outer pane. Other panes stay on their own windows. tmux refuses a client inside one of its own panes while `TMUX` is set, and the nested client is a client of the same server showing a different session, so nothing recurses.
- After each `split-window` the window is re-tiled, so every pane has room for the next split; then `select-layout` applies the project's layout. A layout tmux does not know removes the view again and is a usage error.
- `viewAttachArgv` attaches it with `attach-session`, then sets `destroy-unattached`. Setting it at creation does not work: probed on a throwaway socket, a detached session with `destroy-unattached on` is destroyed at once, before any terminal attaches. Once the terminal detaches, tmux destroys the view, its panes' clients exit, and their own views (also `destroy-unattached`) go too. When `--app` cannot open the terminal app, Mesa removes the view itself, as no terminal will ever attach it.

Evidence: `packages/core/src/sessions/tmux/backend.test.ts` "openView lays windows out side by side, a terminal on each; a layout tmux lacks is usage", on real tmux: `even-vertical` stacks the two panes, each pane's view shows its own window, killing the first window ends only its client and pane while the second still shows and types into its own window (#151), and the later test that expects an empty server still passes, so the nested views are gone once the view is.

## Amendment 2026-09-26: the output log starts with the window (#37)

Continuous logging, as the Decision names it, landed in #37. Choices the text above left open:

- **One call.** `openWindow` takes the log file and chains `pipe-pane -o -t =<project>:=<window> 'cat >> <file>'` onto its `new-session` or `new-window`. tmux runs a command list without reading any pane in between, so the pipe is in place before the agent prints its first byte. The caller (`startSession`, which every start goes through) decides: with the config's `sessions.log` off, it passes no file and nothing is piped.
- **Quoting.** tmux expands formats in the pipe's command, then runs it with `/bin/sh`, so the file is one single-quoted shell word with `#` doubled.
- **Cutting.** A log over 20 MB is cut to its last 5 MB, from its first whole line, whenever Mesa reads it (`mesa logs`, a stop, the pane-died hook). The file is rewritten in place, not replaced: `cat` holds it open for appending (`O_APPEND`), so it goes on writing at the new end, where a rename would leave it writing to a file no path names. A stop and the pane-died hook may cut the same log at once, so the cut holds a lock file beside it (`<id>.log.lock`, `lib/lock-file.ts`) and reads the size again once it has the lock: the second cutter finds the log cut and leaves it. A live session nobody reads grows past 20 MB until then.

Evidence: `packages/core/src/sessions/tmux/backend.test.ts` on real tmux 3.7c: a window whose command prints at once has every byte of it in the log, in a folder named `it's #S logs`, and a window opened without a log has `#{pane_pipe}` 0. `packages/core/src/sessions/output-log.test.ts` cuts a 20 MB log with a writer holding it open for appending, and that writer's next line lands at the end of the cut file; a cut that waited on another mesa's lock leaves the log that mesa cut as it is.

## Amendment 2026-09-26: a headless run's window (#30)

A Skill run (CONTEXT.md) opens its window through the same `openWindow`, output log included, and its command is still one simple command for sh: `exec claude -p '/<skill> <args>' ... </dev/null >~/.mesa/<profile>/sessions/runs/<id>.json`. `exec` applies the redirections and then replaces sh, so the pane's pid and exit status are claude's, and the pane-died hook records the exit as it does any agent's, now with the status or signal on the `exited` event. Stdout, claude's JSON result, goes to the profile, never the vault; stdin is closed, since `claude -p` given a pipe waits 3 s for input first; stderr stays on the pane, so the output log keeps it. Mesa looks at the pane once a second. Once it is dead, Mesa reads the result and closes the window, as the result is in the file: a finished run leaves no dead window behind. The pane-died hook ends a run the same way (`endRun`), so a run whose `mesa run` was killed is still closed and ended. Whichever of the two sees the exit first ends it; the other reads the same result from the same files (the result, and the output log for the last line claude printed) and the exit the record keeps, as the pane is gone by then. The output log holds only what claude printed: tmux's own `Pane is dead (status N, <date>)` line, drawn at the bottom of a dead pane, never reaches `pipe-pane`. Past the run's timeout, `kill-window` closes it.

Evidence: a live check on 2026-09-26 with Claude Code 2.1.283 and tmux 3.7c, on a throwaway profile with a temp HOME. The real claude wrote its JSON result into the file and exited 1: the temp HOME had no login, so the result was `is_error` with "Not logged in". The pane-died hook recorded the exit, and the window was gone afterwards. A stand-in claude that printed a flag error on stderr and exited 2 gave `claude printed no result; claude exited with status 2; error: ...` (read then off the pane, where tmux's dead-pane line had to be skipped). On a throwaway socket, `pipe-pane` of a pane whose process printed one line on stderr and exited 2 logged that line alone. The 3 s wait was seen with `claude -p` fed by a pipe outside tmux. Then, with the owner's login (the real HOME, a throwaway profile, an invented repo), two real session-summary runs each wrote their result (about 20 s, list price about $0.26) and ended `done`, their windows gone. `claude agents --json` listed each `claude -p` under the pane's pid, as `kind: interactive` with `busy`, and `idle` in its last moment, so the board read the run from the listing as for any session.
