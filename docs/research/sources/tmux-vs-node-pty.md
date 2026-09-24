# Session backend evaluation: tmux vs. node-pty-only vs. alternatives

Date: 2026-09-24
Scope: evaluates the proposed backend for Mesa (macOS Electron app + `mesa` CLI running many Claude Code / Codex CLI sessions across many projects).
Environment used for verification: macOS (Darwin 25.6.0), tmux 3.7c installed via Homebrew (`tmux -V` output confirmed locally, accessed 2026-09-24). Man page read locally with `man -P cat tmux` / `man tmux | col -bx`, accessed 2026-09-24. All experiments below ran on a throwaway socket (`tmux -L mesa-verify`); the user's default tmux server was confirmed not running before the test and confirmed still not running after, and only the `mesa-verify` server was killed.

Requirements being evaluated against:
1. Sessions must survive the Electron app restarting or crashing.
2. Any session must be reachable from a normal terminal, not only inside the app.
3. The CLI must be able to send a prompt into a running session (`mesa send <session> "text"`).
4. The app must show an embedded terminal per session (xterm.js + node-pty).
5. There must be a fallback way to read the last N lines of a session's output when agent hooks do not fire.

Proposal under evaluation: tmux backend, one tmux session per project, one window per agent session, `send-keys` for send, `capture-pane` for output tail, node-pty spawning `tmux attach` for the embedded terminal.

---

## 1. tmux capabilities relevant here

Each item below cites the local tmux 3.7c man page (macOS, Homebrew build, accessed 2026-09-24) by command/section name, and notes where it was independently verified against the throwaway socket in Section 5.

### Session and window creation
- `new-session -d -s <name>`: "Create a new session with name session-name... With -d, the initial size comes from the global default-size option." `-d` avoids attaching the calling terminal, which is what Mesa's daemon-side "open" action needs. Source: man tmux, `new-session` section. Verified live (Section 5, Test 1).
- `new-window -t <target>`: "Create a new window... If -d is given, the session does not make the new window the current window." Source: man tmux, `new-window` section. Verified live (Section 5, Test 3).

### Sending input: `send-keys`
- `send-keys [-FHKlMRX] ... [-t target-pane] [key ...]`: "Send a key or keys to a window or client. Each argument key is the name of the key (such as 'C-a' or 'NPage')... if the string is not recognised as a key, it is sent as a series of characters." Source: man tmux, `send-keys` section.
- Gotcha confirmed: because `send-keys` does key-name lookup by default, any literal text that happens to match a key name (or contains characters tmux would otherwise interpret) can be sent wrong. `-l` ("disables key name lookup and processes the keys as literal UTF-8 characters") is the correct way to send a prompt string, and `Enter` must be sent as a **separate** `send-keys ... Enter` call, since `-l` text is not itself interpreted as a keystroke. This is exactly what the smoke test in Section 5 does (`send-keys -l '...'` followed by `send-keys ... Enter`), and it is required for TUI apps like Claude Code and Codex CLI that read raw keystrokes rather than a shell readline buffer - text without a following literal Enter keystroke just sits in the TUI's input box unsent. Source: man tmux, `send-keys` section, `-l` flag.
- Second gotcha, verified live in Test 2 (Section 5): `send-keys` writing into a pane whose foreground process does not read stdin (in the test, `sleep 30`) still shows the typed text on screen (pty line-discipline echo happens regardless of whether the foreground program consumes it), but the text is not "received" by that program. If/when the foreground process changes (e.g., the shell resumes because `sleep` exits, or Claude Code finishes a turn and returns to its prompt), the buffered characters get delivered late/unexpectedly. This is the "send-keys racing a busy pane" problem named in the task: Mesa's `send` implementation must check `pane_current_command` (see below) before trusting that a `send-keys` call will land on the intended prompt.

### Reading the tail: `capture-pane`
- `capture-pane [-aeFHLpPqCJMN] [-b buffer-name] [-E end-line] [-S start-line] [-t target-pane]`: "Capture the contents of a pane. If -p is given, the output goes to stdout... -S and -E specify the starting and ending line numbers, zero is the first line of the visible pane and negative numbers are lines in the history." Source: man tmux, `capture-pane` section.
- `capture-pane -p -t <target> -S -N` (N negative, e.g. `-10`) is exactly the fallback-tail mechanism the task asks for: it reads N lines of scrollback without needing the agent's own hook output. Verified live in Section 5, Tests 1 and 2.
- Limitation: scrollback is bounded by the `history-limit` session/window option. Man tmux: "A configurable history buffer is also maintained for each window. By default, up to 2000 lines are kept; this can be altered with the history-limit option." Source: man tmux, BUFFERS section and `history-limit` option under `set-option`. Mesa should set `history-limit` explicitly per window (e.g., via `set-option -t <target> history-limit 10000`) rather than rely on the 2000-line default, since a long agent turn can exceed that.

### Continuous logging: `pipe-pane`
- `pipe-pane [-IOo] [-t target-pane] [shell-command]`: "Pipe output sent by the program in target-pane to a shell command... -O stdin is connected (so any output in the pane is piped to shell-command)... The -o option only opens a new pipe if no previous pipe exists, allowing a pipe to be toggled." Source: man tmux, `pipe-pane` section.
- Verified live (Section 5, Test 4): `pipe-pane -o -t <target> 'cat >> file'` continuously appended pane output to a log file as new output arrived, without disturbing the live pane. This is a second, independent way to satisfy the "read last N lines when hooks don't fire" requirement (tail the log file instead of calling `capture-pane`), and it is append-only so it survives beyond the tmux `history-limit` window.

### `list-windows` formats
- `list-windows [-ar] [-F format] [-f filter] [-O sort-order] [-t target-session]`. Format variables confirmed present in the FORMATS section of man tmux: `window_name` (#W, "Name of window"), `pane_pid` ("PID of first process in pane"), `pane_current_command` ("Current command if available"), `pane_current_path` ("Current path if available"), `window_activity` ("Time of window last activity"), `pane_dead` ("1 if pane is dead"). Source: man tmux, `list-windows` and FORMATS sections.
- Verified live (Section 5, Test 3) with `-F '#{window_index} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{window_activity} #{pane_dead}'`, producing one line per window Mesa can parse for its session list. `pane_current_command` is what lets Mesa distinguish "an agent CLI is running in this pane" from "the pane fell back to a shell" (e.g., after the agent process exited), which matters for both the send-keys race above and for `remain-on-exit` below.

### Hooks: `set-hook`
- `set-hook` targets, confirmed in man tmux's hooks list: `pane-died` ("Run when the program running in a pane exits, but remain-on-exit is on so the pane has not closed"), `alert-activity` ("Run when a window has activity. See monitor-activity"), `alert-silence` ("Run when a window has been silent. See monitor-silence"), `window-linked` ("Run when a window is linked into a session"). Source: man tmux, HOOKS section.
- `alert-activity`/`alert-silence` require the corresponding `monitor-activity`/`monitor-silence` window options to be enabled first; they are off by default, so Mesa must turn them on per window if it wants those hooks to fire. Source: man tmux, HOOKS section cross-reference and `monitor-activity`/`monitor-silence` window options under `set-option`.
- `pane-died` is the useful one for detecting "the agent CLI process exited but we kept the pane open to show the final output" - it only fires when `remain-on-exit` is enabled (see next).

### `remain-on-exit`
- `remain-on-exit [on | off | failed | key]`: "A pane with this flag set is not destroyed when the program running in it exits... The pane may be reactivated with the respawn-pane command." Source: man tmux, window options under `set-option`.
- This is what lets Mesa keep a dead agent's final screen visible (and readable via `capture-pane`) instead of the window silently closing when Claude Code/Codex exits or crashes, and it's the prerequisite for the `pane-died` hook above.

### `-L socket-name` isolation
- "-L socket-name: tmux stores the server socket in a directory under TMUX_TMPDIR or /tmp if it is unset. The default socket is named default. This option allows a different socket name to be specified, allowing several independent tmux servers to be run." Source: man tmux, top-level OPTIONS.
- Verified live: the whole smoke test ran under `-L mesa-verify`, creating `/tmp/tmux-501/mesa-verify` as a separate socket file (confirmed via `ls`), and `tmux list-sessions` (no `-L`, i.e. the `default` socket) reported "error connecting to /private/tmp/tmux-501/default (No such file or directory)" both before and after the test, confirming Mesa's server never touched the user's own default tmux server. This is the concrete mechanism for "Mesa uses its own server and never touches the user's."

### `attach-session -t` for the embedded terminal
- `attach-session [-dErx] [-c working-directory] [-f flags] [-t target-session]`: "If run from outside tmux, attach to target-session in the current terminal... If -d is specified, any other clients attached to the session are detached." Source: man tmux, `attach-session` section.
- Relevant client flag for the "multiple clients on one session sharing size" limitation: `-f ignore-size` ("the client does not affect the size of other clients"). This is the more targeted fix for Mesa's case (an xterm.js client attached via node-pty and a user's own terminal attached to the same session) than the `aggressive-resize` window option, which instead changes which session's dimensions a *window* follows when it's the current window in more than one session. Source: man tmux, `attach-session` -f flags list, and `aggressive-resize` window option under `set-option`.
- Practical default recommended for Mesa: attach the embedded xterm.js client with `-f ignore-size` (or use one tmux session per Mesa-managed pty, which the proposal already does per-project) so a user popping open their own terminal against the same session doesn't fight the embedded terminal over pane dimensions.

### `-CC` control mode as an alternative attach method
- CONTROL MODE section: "tmux offers a textual interface called control mode. This allows applications to communicate with tmux using a simple text-only protocol. In control mode, a client sends tmux commands or command sequences terminated by newlines on standard input. Each command will produce one block of output... tmux outputs notifications." Example block format and notification list (`%client-detached`, `%client-session-changed`, etc.) confirmed present. Source: man tmux, CONTROL MODE section.
- Trade-off for Mesa: `-CC` gives a structured, parseable protocol instead of raw ANSI screen bytes, which is attractive for driving a custom renderer, but xterm.js already expects raw terminal bytes (it's a terminal emulator), so spawning `tmux attach` under node-pty and feeding its raw output straight into xterm.js is simpler and reuses xterm.js's existing VT100 parsing. `-CC` would mainly be useful if Mesa later wants a non-terminal UI (e.g., structured pane list, output diffing) driven over the same connection without a second protocol. Recommendation: use plain `attach-session` (raw mode) for the embedded terminal now; keep `-CC` in reserve for a future structured-control need.

### Documented limitations (all confirmed against the man page)
- **Server lifetime**: the tmux server is a normal user process. On macOS it detaches from the process that launched it (survives that parent, e.g., Terminal.app or Mesa's Electron app, closing), but it does not survive a full user logout or reboot - nothing in tmux persists process state across a server restart. `tmux-resurrect` (github.com/tmux-plugins/tmux-resurrect, accessed 2026-09-24) confirms this is exactly the gap it exists to paper over: it "saves all the little details from your tmux environment so it can be completely restored after a system restart," requiring tmux >= 1.9, but it restores *layout and working directories*, not live process state - a restarted Claude Code/Codex session starts fresh, it does not resume mid-turn. Mesa should treat tmux persistence as "survives app crash/restart" (satisfies requirement 1 as stated) but explicitly not as "survives machine reboot with live state," and should decide separately whether it wants a resurrect-style snapshot/restore for the reboot case.
- **Scrollback limit**: `history-limit` defaults to 2000 lines per window (man tmux, BUFFERS section) and must be raised for long agent output; `capture-pane -S -N` cannot return more than what the buffer retains, which is why `pipe-pane` logging to a file is the belt-and-suspenders fallback.
- **Multi-client size contention**: covered above under `attach-session`; use `ignore-size` per client.
- **send-keys racing a busy pane**: covered above and demonstrated live in Test 2.

---

## 2. node-pty alone (no multiplexer)

A pty spawned directly by `node-pty` in the Electron main process is a child of that process. Electron/node-pty issue reports confirm the failure mode the task describes: "In a usual Electron + node-pty setup, the PTY is spawned in the main Node process of the app. This process is killed when the app closes, killing its child process as well" (Superset, "The Terminal That (Almost) Never Dies: Building a Persistent Terminal Daemon for Electron," superset.sh/blog/terminal-daemon-deep-dive, accessed 2026-09-24). Electron's own tracker has the same complaint from the other direction - child processes sometimes outliving the app unexpectedly on unclean shutdown (electron/electron#9862, accessed 2026-09-24) - and node-pty's tracker documents teardown races between the pty's exit callback and Electron quitting (microsoft/node-pty#382, and thread-safe-callback-during-shutdown crash reports, accessed 2026-09-24). Net effect: node-pty-in-the-renderer's-main-process gives Mesa requirement 4 (embedded terminal) essentially for free, but gives it nothing toward requirements 1-3 and 5 - a pty dies with the app by default.

To get persistence with node-pty alone, Mesa would need to build the daemon the task describes: a separate long-running process (a macOS `launchd` LaunchAgent, since that's the standard way to keep a user process alive across app restarts and re-launch it at login) that owns every pty, decoupled from Electron's lifecycle. That daemon then needs, from scratch: (a) its own IPC surface so the Electron main process and the `mesa` CLI can both send input and receive output/attach - realistically a small Unix-domain-socket JSON-RPC or line protocol; (b) an attach protocol so a plain terminal *and* the embedded xterm.js view can both connect to the same live pty, including handling multiple simultaneous readers/writers and terminal resize propagation, which is exactly what tmux's client/server model already does; (c) its own scrollback storage per pty (a ring buffer or append-log, since raw pty output isn't persisted anywhere once printed) to answer "last N lines"; (d) process supervision - restart-on-crash for the daemon itself, socket cleanup, orphan pty reaping; (e) packaging/installation as a LaunchAgent plist, with the usual first-run permission and code-signing considerations for a background service on macOS.

Honest scope estimate (engineering judgment, not sourced - flagged as such): items (a)-(c) are the bulk of the work and each is a small-to-medium subsystem in its own right. IPC + attach protocol with multi-reader support: roughly 3-5 days for a first working version, more once resize/backpressure/reconnect edge cases show up. Scrollback storage (ring buffer per pty, log rotation, N-line tail query): roughly 1-2 days. LaunchAgent packaging, crash/restart supervision, and socket lifecycle hardening: roughly 2-3 days. CLI-side client for `mesa send`/`mesa tail`/`mesa attach` against the new protocol: roughly 1-2 days. Total: on the order of **7-12 agent/engineer-days (roughly 55-95 hours)** to reach rough parity with what tmux already provides today, before accounting for the multi-window-per-project grouping tmux gives for free, or for hardening against the same class of bugs (partial writes, orphaned children, terminal state corruption) that a 20+ year old, actively maintained project like tmux has already found and fixed. This is a real, custom terminal-multiplexer-and-session-daemon project, not a thin wrapper.

---

## 3. Alternatives

**zellij.** zellij has the pieces Mesa would need: `zellij action write-chars` sends text into a session non-interactively (documented example: `zellij -s python-dev action write-chars $'print("hello world")\n'`), `zellij action dump-screen` dumps a pane's viewport (with `--full` for scrollback, `--pane-id` to target a specific pane) to a file or stdout, and it has built-in session persistence/resurrection: "each session is serialized and kept in the user's cache folder to be recreated after an intentional quit or unintentional crash," with a `serialization_interval` and optional `pane_viewport_serialization`/`scrollback_lines_to_serialize` for saving visible content, not just layout (zellij.dev/documentation/cli-actions, /programmatic-control, /session-resurrection, accessed 2026-09-24). This is architecturally closer to "persist the actual content," which is more than tmux-resurrect offers out of the box. Against it: it's a younger project with a smaller ecosystem than tmux, no equivalent of tmux's decades of battle-testing, scripting idioms, and StackOverflow-level tooling maturity, and its dump-screen/session-resurrection feature set is still actively evolving (open feature requests exist even for "dump screen of detached sessions," zellij-org/zellij#4508, accessed 2026-09-24), which raises integration risk for a v1 backend Mesa would depend on immediately.

**GNU screen.** screen pioneered detach/reattach and has real multiuser support with fine-grained ACLs, but it is architecturally a single monolithic session per attach point rather than tmux's session/window/pane model with independent per-client views: "in GNU Screen, all connected users are forced to view the exact same window in lockstep," versus tmux where "multiple clients can attach to the same session group while looking at completely different windows simultaneously" (tmux vs GNU Screen comparison, tech-insider.org/zellij-vs-tmux-vs-screen-2026, accessed 2026-09-24). For Mesa, where the embedded xterm.js client and a user's own terminal need to be able to look at *different* windows of the same project session independently, tmux's model is a direct fit and screen's is not. screen also lacks tmux's scriptable format-string introspection (`list-windows -F`) and structured hooks, both of which Mesa's list/tail logic depends on.

**dtach / abduco.** Both are minimal detach-only tools, not multiplexers: "dtach is a tiny program that emulates the detach feature of screen... dtach does not keep track of the contents of the screen" and "abduco is a simple and lightweight session manager that provides detach/attach functionality for any terminal program... [it] does not provide multiple windows and multiplexing. If that is needed, use dvtm, tmux, or GNU Screen" (terminal.guide/tools/multiplexer/abduco, ArchWiki "Abduco," accessed 2026-09-24). Neither gives Mesa `capture-pane`-style scrollback query or multi-window-per-project grouping without pairing it with something else (e.g., abduco + dvtm); they solve only the "survive app restart" half of the requirements and would need the same custom tail/log/window-management layer node-pty-alone would need. Not a net simplification over tmux for Mesa's requirement set.

**OpenAI Codex `app-server` / Claude Agent SDK (non-terminal backends).** Codex's `app-server` is "the interface Codex uses to power rich clients... used when you want a deep integration inside your own product with authentication, conversation history, approvals, and streamed agent events," explicitly described as "experimental, broader than the SDK, and designed for rich product integrations" (developers.openai.com/codex/app-server, accessed 2026-09-24), and Claude Code/Claude Agent SDK expose an analogous headless mode (`-p`/`--print` with `--output-format stream-json`). Both let Mesa drive an agent as structured events instead of terminal bytes, which sidesteps every tmux gotcha above. But both requirements 4 ("embedded terminal per session," specifically xterm.js) and the implicit requirement of preserving the CLI's own interactive permission-approval prompts are terminal/TUI-shaped requirements: switching to app-server/SDK-driven sessions means Mesa reimplements the CLI's approval UI, streaming render, and any TUI-only affordances itself, and loses the "it's just the real CLI, reachable from a real terminal too" property that requirement 2 explicitly asks for. This is a legitimate alternative for a *future* non-interactive/automation surface in Mesa, but it does not satisfy the stated requirements as a replacement for the terminal-based backend.

---

## 4. Recommendation

**Keep tmux.** It is the only option evaluated that satisfies all five requirements today, using functionality that is already implemented, documented, and (per Section 5) verified to behave as expected, rather than functionality Mesa would have to build.

What tmux concretely buys, each tied to a requirement:
- **Persistence across app restart/crash (req 1)**: the tmux server is a process independent of Electron; killing or crashing the Electron app does not touch it. Verified structurally in Section 5 (server process is addressed purely by socket path, with no dependency on any client, including Electron, being attached).
- **Reachability from a normal terminal (req 2)**: `tmux -L mesa-<profile> attach -t <project>` from any terminal reaches the exact same session the app shows, with no separate protocol to implement.
- **Send (req 3)** and **tail (req 5)**: `send-keys` and `capture-pane`/`pipe-pane` are complete, already-shipped implementations of exactly those two operations (Section 1, verified live in Section 5).
- **Embedded terminal (req 4)**: node-pty spawning `tmux attach` gives xterm.js raw terminal bytes it already knows how to render; no new protocol needed.

What it costs: a Homebrew (or bundled-binary) dependency on tmux itself, which Mesa must ship or require; TUI-in-tmux quirks that need explicit handling - `TERM` must be `screen`/`tmux`/a derivative for tmux to behave correctly (man tmux, `default-terminal` option), and mouse passthrough/scroll behavior inside Claude Code's and Codex's own TUIs needs testing under tmux's `mouse` option; and tmux becomes one more layer in the failure/debugging path (a "why isn't my agent responding" bug could be in the agent, in tmux, or in Mesa's use of tmux).

**Naming scheme.**
- Socket: `mesa-<profile>` (e.g., `mesa-default`, or `mesa-dev` for a local dev build of the app) - isolates Mesa's server(s) from the user's own tmux and from other Mesa installs/profiles on the same machine.
- Session: `<project>` - one tmux session per project, exactly as proposed, keyed off a stable per-project slug Mesa already needs for other bookkeeping.
- Window: `<agent>-<shortid>` - e.g., `claude-a1b2c3` or `codex-f9e001`, one window per agent session, where `<agent>` identifies which CLI is running and `<shortid>` disambiguates concurrent sessions of the same agent in the same project.

**Exact commands per Mesa action** (using socket `mesa-default`, project `acme-web`, agent window `claude-a1b2c3`):

- **open** (create a project session if absent, then a window for the agent):
  `tmux -L mesa-default new-session -d -s acme-web -n claude-a1b2c3 '<agent CLI invocation>'` (first window in a new session) or `tmux -L mesa-default new-window -t acme-web -n claude-a1b2c3 '<agent CLI invocation>'` (additional window in an existing session). Follow immediately with `tmux -L mesa-default set-option -t acme-web:claude-a1b2c3 remain-on-exit on` and `tmux -L mesa-default set-option -t acme-web:claude-a1b2c3 history-limit 10000` so the pane survives agent exit and scrollback isn't truncated at the 2000-line default.
- **stop**: `tmux -L mesa-default kill-window -t acme-web:claude-a1b2c3` (single agent session) or `tmux -L mesa-default kill-session -t acme-web` (whole project).
- **send**: `tmux -L mesa-default send-keys -t acme-web:claude-a1b2c3 -l '<prompt text>'` immediately followed by `tmux -L mesa-default send-keys -t acme-web:claude-a1b2c3 Enter` as a separate call (never combine literal text and `Enter` in one `-l` call; `-l` text is not interpreted as a keystroke).
- **tail**: `tmux -L mesa-default capture-pane -p -t acme-web:claude-a1b2c3 -S -200` for the last 200 lines on demand; for continuous logging so hook-less tailing survives beyond `history-limit`, additionally run `tmux -L mesa-default pipe-pane -o -t acme-web:claude-a1b2c3 'cat >> ~/Library/Application Support/Mesa/logs/acme-web.claude-a1b2c3.log'` once when the window is created.
- **attach** (embedded terminal, spawned by node-pty in the main process): `tmux -L mesa-default attach-session -t acme-web:claude-a1b2c3 -f ignore-size` - attach the specific window's session with `ignore-size` so this client doesn't force its own dimensions onto a concurrently-attached user terminal.
- **list**: `tmux -L mesa-default list-windows -t acme-web -F '#{window_index} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{window_activity} #{pane_dead}'` per project, or `tmux -L mesa-default list-sessions -F '#{session_name} #{session_windows} #{session_created}'` for the project list.

**tmux gotchas that must be filed as issues before/while building on this backend:**
1. `send-keys` racing a busy pane (Section 1, Section 5 Test 2) - Mesa must check `pane_current_command` before sending, and/or debounce sends against recent output activity.
2. `-l` + separate `Enter` is mandatory for TUI targets; a single combined call will not submit the prompt.
3. `history-limit` defaults to 2000 lines and must be raised per window at creation time, or `capture-pane -S -N` silently truncates.
4. `remain-on-exit` must be turned on per window at creation time (it is not a global default), or the pane and its output vanish the instant the agent CLI exits/crashes, breaking both requirement 5 and any post-mortem debugging.
5. `TERM` must resolve to `screen`/`tmux`/a derivative inside tmux panes (`default-terminal` option) or the agent CLIs' TUIs may misrender; this needs a smoke test against both Claude Code's and Codex CLI's actual TUI rendering, not just plain shells.
6. Multiple attached clients (embedded terminal + user's own terminal) contend for pane size unless the embedded client attaches with `-f ignore-size`.
7. tmux sessions do not survive full logout/reboot; only app-restart/crash persistence is guaranteed out of the box. If "survive reboot" is later added as a requirement, that needs a resurrect-style snapshot mechanism (or a launchd-managed tmux server start), which is separate work.

**Open questions** (not resolved by this research, need a decision from the team):
- Does Mesa need `history-limit` and scrollback tuned per-agent (long-running agents vs. short ones), or is one global value acceptable?
- Should `pipe-pane` logging be always-on for every window (simplest, but writes continuously to disk for every session) or only enabled on demand when a hook-less tail is actually requested?
- Should the `mesa-<profile>` socket be a single fixed profile, or does Mesa need per-user or per-install-instance sockets (e.g., for running two copies of the app during development)?
- Has mouse behavior inside tmux been verified against both Claude Code's and Codex CLI's actual interactive TUIs (this research verified tmux mechanics with a plain shell command, not the real agent CLIs)?

---

## 5. Smoke test (throwaway socket `mesa-verify`, executed 2026-09-24)

Before the test, the user's default tmux server was confirmed not running:
```
$ tmux list-sessions
error connecting to /private/tmp/tmux-501/default (No such file or directory)
```

**Test 1 - create session and window, list, capture:**
```
$ tmux -L mesa-verify new-session -d -s testproj -n win1 'printf "hello\n"; sleep 30'

$ tmux -L mesa-verify list-sessions
testproj: 1 windows (created Thu Sep 24 11:07:27 2026)

$ tmux -L mesa-verify list-windows -t testproj -F '#{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{window_activity} #{pane_dead}'
win1 21653 sleep /Users/gzorrilla/Developer/personal/mesa 1790273247 0

$ tmux -L mesa-verify capture-pane -p -t testproj:win1 -S -10
hello
(trailing blank lines omitted - the pane buffer pads to full pane height)
```

**Test 2 - send-keys into the pane (literal text, then separate Enter), capture again:**
```
$ tmux -L mesa-verify send-keys -t testproj:win1 -l 'echo sent-from-mesa'
$ tmux -L mesa-verify send-keys -t testproj:win1 Enter

$ tmux -L mesa-verify capture-pane -p -t testproj:win1 -S -10
hello
echo sent-from-mesa
(trailing blank lines omitted)
```
Note: the pane's foreground process was still `sleep 30` (confirmed by `pane_current_command` above), which does not read stdin. The typed text appears on screen because of pty line-discipline echo, but was never executed as a command - this is the live demonstration of the "send-keys racing a busy pane" gotcha noted in Section 1.

**Test 3 - second window (multi-window-per-session), list with format string:**
```
$ tmux -L mesa-verify new-window -t testproj -n win2-abc123 'printf "second window\n"; sleep 30'

$ tmux -L mesa-verify list-windows -t testproj -F '#{window_index} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{window_activity} #{pane_dead}'
0 win1 21653 sleep /Users/gzorrilla/Developer/personal/mesa 1790273248 0
1 win2-abc123 22268 sleep /Users/gzorrilla/Developer/personal/mesa 1790273257 0
```

**Test 4 - pipe-pane continuous logging:**
```
$ tmux -L mesa-verify pipe-pane -o -t testproj:win1 'cat >> mesa-verify-win1.log'
$ tmux -L mesa-verify send-keys -t testproj:win1 -l 'echo piped-line'
$ tmux -L mesa-verify send-keys -t testproj:win1 Enter

$ cat mesa-verify-win1.log
echo piped-line
```

**Test 5 - teardown, confirming only the throwaway server was touched:**
```
$ tmux -L mesa-verify kill-server

$ tmux -L mesa-verify list-sessions
no server running on /private/tmp/tmux-501/mesa-verify

$ tmux list-sessions
error connecting to /private/tmp/tmux-501/default (No such file or directory)
```
The default socket error message is identical before and after the test, confirming the user's own tmux server was never created, attached, or modified.

---

## Sources

| Claim | Source | Access date |
|---|---|---|
| tmux 3.7c installed locally; all command syntax, options, FORMATS, HOOKS behavior | `man tmux` (tmux 3.7c, Homebrew, macOS Darwin 25.6.0), read via `man -P cat tmux` and `man tmux \| col -bx` | 2026-09-24 |
| tmux persists across app restart but not reboot; resurrect fills that gap by snapshotting layout, not live process state | github.com/tmux-plugins/tmux-resurrect | 2026-09-24 |
| macOS launchd does not track/kill a daemonized tmux server when its launching process exits | Arch Linux Forums, "[Solved] tmux server being killed after logging out" (bbs.archlinux.org/viewtopic.php?id=294348) | 2026-09-24 |
| node-pty child dies when the Electron main process that spawned it exits; teardown races | Superset, "The Terminal That (Almost) Never Dies" (superset.sh/blog/terminal-daemon-deep-dive); microsoft/node-pty#382; electron/electron#9862 | 2026-09-24 |
| zellij `write-chars`, `dump-screen`, session resurrection/serialization | zellij.dev/documentation/cli-actions, /programmatic-control, /session-resurrection; zellij-org/zellij#4508 | 2026-09-24 |
| GNU screen: single shared view per attach vs. tmux's independent per-client windows | tech-insider.org/zellij-vs-tmux-vs-screen-2026 | 2026-09-24 |
| dtach and abduco are detach-only, not multiplexers | terminal.guide/tools/multiplexer/abduco; ArchWiki "Abduco" | 2026-09-24 |
| Codex `app-server` protocol purpose and scope | developers.openai.com/codex/app-server | 2026-09-24 |
| Smoke test transcript (Section 5) | Commands executed directly against `tmux -L mesa-verify` on this machine | 2026-09-24 |
