# Claude Code agentic OS: how people build it today

Research pass for Mesa v1 (Claude-only). Method: web search plus direct reads
of READMEs and official docs via `gh repo view` / `gh api .../readme` and
WebFetch. Access date for every source below is 2026-09-24 unless noted.
Known projects (claude-squad, ccmanager, crystal, vibe-kanban, happy, recon,
ntm, agentapi, claude-flow) were skipped; none of the reads below surfaced a
new fact about them, so they are not mentioned further.

## Sources

### eyes-on-claude-code (joe-re)
- https://github.com/joe-re/eyes-on-claude-code, 27 stars, MIT, pushed 2026-09-24
- What: Tauri desktop app (menubar + dashboard) for monitoring Claude Code sessions across projects. Closest analog to Mesa's shell.
- Launch: does not launch Claude itself; it discovers sessions already running, including ones started in tmux.
- State: global Claude Code hooks write JSONL events to `~/.eocc/logs/events.jsonl`, which the app tails. Four states: Active, WaitingPermission, WaitingInput, Completed.
- Memory: none; it is a monitor, not a memory store.
- Permissions/questions: no remote approval; it only surfaces the waiting state and sound/notification alerts.
- Trick: for tmux sessions it opens a separate viewer window that polls the pane every 500ms, renders ANSI colors, and forwards keystrokes (including IME composition) back into the pane, instead of shelling out to attach.

### tmux-claude-hatch (craftzdog)
- https://github.com/craftzdog/tmux-claude-hatch, 393 stars, MIT, pushed 2026-09-21
- What: tmux plugin (plus optional Claude Code plugin) that runs one Claude Code session per project in a popup, with an fzf picker over all running sessions.
- Launch: plain `claude` (or configured command/args) inside a nested tmux session opened as a `display-popup`; closing the popup does not stop the session.
- State: reads status (working/waiting/idle) directly from `claude agents --json`, parsed with `jq`. Requires Claude Code >= 2.1.139 for the `claude agents` command.
- Memory: none.
- Permissions/questions: none built in; docs show setting `--dangerously-skip-permissions` as a launch arg if wanted.
- Trick: a companion Claude Code plugin makes Claude ring the terminal bell on Stop/waiting events, and tmux forwards that bell to highlight the window the session was launched from, so you notice without opening the picker.

### claude-tmux (nielsgroen)
- https://github.com/nielsgroen/claude-tmux, 206 stars, Other (non-standard) license, pushed 2026-04-17
- What: Rust TUI (`ratatui`), opened as a tmux popup, listing every tmux session with a Claude Code pane.
- Launch: does not itself launch Claude; it manages tmux sessions and expects `claude` to already be running in one pane per session. Includes git worktree and PR (via `gh`) support for creating sessions.
- State: pure pane-text pattern matching, no hooks. A border character plus "ctrl+c to interrupt" means Working; the same border without it means Idle; `[y/n]` or `[Y/n]` in the pane means Waiting; anything else is Unknown.
- Memory: none.
- Permissions/questions: none, it only detects the `[y/n]` prompt text, it does not answer it.
- Trick: identifies a "Claude session" by finding any pane whose running command is `claude`, not by session naming convention, so ordinary tmux sessions and Claude sessions can mix freely.

### dmux (standardagents, formerly formkit)
- https://github.com/standardagents/dmux, 1782 stars, MIT, pushed 2026-08-16
- What: terminal multiplexer TUI purpose-built for coding agents (Claude Code, Codex, and others), one tmux pane plus one git worktree per task.
- Launch: creates a git worktree and branch, then launches the chosen agent CLI in a new tmux pane inside that worktree; also supports a plain terminal pane with no agent.
- State: not documented in the README beyond pane visibility controls and macOS notifications when a background pane "settles and needs you."
- Memory: none for cross-session memory; it tracks which pane last ran which agent so panes can resume their conversation when recreated.
- Permissions/questions: none built in.
- Trick: lifecycle hooks run scripts on worktree create, pre-merge, and post-merge, and a "Merge" or "Create GitHub PR" action in the pane menu closes the loop from isolated worktree back to the main branch.

### claude-code-monitor (bruceyxli)
- https://github.com/bruceyxli/claude-code-monitor, 13 stars, MIT, pushed 2026-05-05
- What: Node/Express + WebSocket web dashboard for all active Claude Code sessions across IDEs and terminals, with LAN support for monitoring other machines.
- Launch: does not launch Claude; hooks into sessions started normally.
- State: global hooks call a `hook-handler.js`, which POSTs every event (session start/end, tool use, prompts) to a local server that tracks per-session state and broadcasts over WebSocket.
- Memory: none, it reads transcript files only for token counts.
- Permissions/questions: "Remote Approval" intercepts `PreToolUse` via the hook for non-safe tools, the hook enters a polling loop (up to 2 minutes) waiting on a decision the dashboard operator makes, then emits `{"decision": "allow"|"deny"}` on stdout for Claude Code to consume.
- Trick: "Window focus" jumps to the exact IDE/terminal window a session is running in, using AppleScript on macOS, Win32 APIs on Windows, and wmctrl/xdotool/gdbus on Linux, local-machine only.

### claude-activity-monitor (theshane0314)
- https://github.com/theshane0314/claude-activity-monitor, 0 stars, no license file, pushed 2026-09-15
- What: Windows PowerShell/WPF live dashboard, plus a hook-driven physical status light (a Yeelight LED cube) as a second output.
- Launch: does not launch Claude; observes existing sessions.
- State: 14 global hooks append JSONL events; a WPF UI thread tails the log and open transcripts every 400ms. The status light keys off the same hooks: PermissionRequest/Notification is red, PreToolUse/PostToolUse/UserPromptSubmit is yellow, Stop/SessionStart/SessionEnd is green.
- Memory: none.
- Permissions/questions: none, purely observational.
- Trick: because hooks alone cannot see a `run_in_background` command still executing after `Stop`, the light checks whether that command's output file is still held open (an OS file lock) before going green, since a backgrounded task outlives the turn that started it and orphaning breaks any process-tree based guess.

### claude-monitor (szaher)
- https://github.com/szaher/claude-monitor, 6 stars, Apache-2.0, pushed 2026-06-05
- What: Go CLI plus embedded web SPA dashboard, backed by SQLite with full-text search, for tokens, cost, tool calls, and session history.
- Launch: does not launch Claude.
- State: a hook receiver listens on a Unix socket for real-time hook events, and a filesystem watcher (fsnotify) tails JSONL transcripts under `~/.claude/projects/` as a second, independent state source.
- Memory: SQLite database at `~/.claude-monitor/claude-monitor.db`, with historical import of existing transcripts and CSV/JSON/HTML export.
- Permissions/questions: none.
- Trick: costs are computed per assistant turn against that turn's own model prices, so a session that switches models mid-conversation is still costed correctly.

### claude-obsidian (AgriciDaniel)
- https://github.com/AgriciDaniel/claude-obsidian, 15199 stars, MIT, pushed 2026-09-10
- What: a Claude Code plugin (15 skills) that turns an Obsidian vault into cited, linked, long-term memory, usable from Claude Code, Codex, and other Agent Skills hosts.
- Launch: not a launcher; it is invoked as skills (`/claude-obsidian:wiki`, `wiki-ingest`, `wiki-query`, `save`, etc.) from inside a normal `claude` session run from the vault directory.
- State: not applicable, it has no session dashboard.
- Memory: plain Markdown/JSON/source files in a normal directory, explicitly "not hidden in a plugin cache, locked in a cloud database, or silently uploaded to a model." Notes carry source and claim ledgers (authority, freshness, confidence).
- Permissions/questions: mutating setup commands print a JSON plan and require an `--approved-plan-sha256` matching that exact plan before they apply.
- Trick: one process-lifetime vault lock plus journaled, atomic writes, so "parallel agents cannot race the vault": workers only ever return drafts, and one orchestrator inspects and applies a single recoverable transaction.

### Claude Code Session Manager / CCSM (KenCheung-AIxFinance)
- https://github.com/KenCheung-AIxFinance/claude-code-session-manager, 10 stars, no license file, pushed 2026-06-07
- What: Python CLI/TUI for listing, inspecting, and deleting Claude Code sessions and all of their associated on-disk data.
- Launch: not a launcher, a cleanup and inspection tool.
- State: reads session marker files directly (`~/.claude/sessions/*.json`), task/todo/plan/env/team/file-history directories, and per-project transcript JSONL files.
- Memory: none, it deletes Claude Code's own memory artifacts rather than adding any.
- Permissions/questions: every delete supports `--dry-run` first, and `cleanup` defaults to dry-run.
- Trick: documents exactly which on-disk paths constitute a "session" (tasks, todos, plans, session-env, teams, file-history, debug logs, telemetry, transcripts, paste-cache, history.jsonl), which is the clearest inventory found of what Claude Code itself persists per session.

### Claude Code Sessions Dashboard (digorgonzola)
- https://github.com/digorgonzola/claude-code-dashboard, 0 stars, Apache-2.0, pushed 2026-09-07
- What: zero-dependency Node HTTP server plus static SPA, a local read-mostly dashboard over every session on the machine, action queue plus roster plus usage plus history.
- Launch: does not launch Claude; it discovers sessions Claude Code itself already tracks.
- State: no hooks at all. "Live" sessions come from `~/.claude/sessions/<pid>.json` (one file per running process, checked against the live process table); status (waiting/running/idle) is inferred from the transcript tail plus its mtime, and the README states plainly this is "a heuristic" that "can't tell a permission prompt from a slow tool with certainty."
- Memory: none, read-only against Claude Code's own files.
- Permissions/questions: deliberately not wired up in place, "it would require driving Claude Code's undocumented per-session IPC socket, and getting it wrong could inject bad input into real, running work." Every action routes the human back into the real session instead.
- Trick: "Resume in terminal" writes a small executable `.command` file (`cd <cwd> && exec claude --resume <id>`) and calls macOS `open` on it, so the OS launches whichever app the user has set to own shell scripts (Terminal, iTerm2, Warp), rather than hardcoding one terminal app.

### parallel-sessions (marshallguillory86)
- https://github.com/marshallguillory86/parallel-sessions, 0 stars, MIT, pushed 2026-09-23
- What: a Claude Code skill plus Python CLI for running 3 to 5 sessions in parallel on one repo via git worktrees, built around a path-ownership plan.
- Launch: prints `cd worktrees/thread-N && claude` invocations for the human to open in their own terminals; explicitly "the skill never auto-launches terminals, every session is human-attended."
- State: `parallel-sessions status` checks progress across threads; mechanism not detailed beyond that.
- Memory: a `plan.toml` declaring each thread's branch, goal, and owned/forbidden paths; the CLI generates a `THREAD_BRIEF.md` per worktree from it.
- Permissions/questions: the CLI refuses to fan out at all when two threads claim overlapping paths, forcing the plan to be conflict-free before any worktree exists.
- Trick: re-convergence is mechanical, not automatic: one PR per thread, ordered by a `merge_order` declared up front, with no auto-merge and no automatic conflict resolution.

## Recommendations for Mesa v1 (Claude only)

1. **Make `claude agents --json` the primary state signal, not pane-text parsing.** tmux-claude-hatch reads working/waiting/idle straight from `claude agents --json` and calls it "no setup," while claude-tmux has to regex-match border characters and `[y/n]` text and falls back to an explicit "Unknown" state when that fails. Mesa's plan to use `claude agents --json` alongside hooks is the right choice; treat the tmux pane tail as a display convenience (a live preview for the human) rather than a truth source for state, the same way claude-tmux's own fragility argues against it.

2. **Trust hooks over transcript mtime, and add a background-task check before declaring idle.** digorgonzola's claude-code-dashboard has no hooks and openly flags its transcript-tail-plus-mtime status as "a heuristic" that cannot tell a permission prompt from a slow tool. claude-activity-monitor shows the fix: key state off hook events (PermissionRequest/Notification = waiting, Stop/SessionEnd = done) but also check whether a backgrounded command's output file is still locked before going idle, since `Stop` fires even while a `run_in_background` command is still running. Mesa's hook-first design (PermissionRequest, Stop, SessionEnd, PreToolUse, Notification) is validated; add the same "still-running background task" check before marking a window idle.

3. **Do not build an in-app terminal pane viewer; shell out to the user's real terminal, matching Mesa's own plan.** eyes-on-claude-code, the closest analog to Mesa, had to build a 500ms-polling ANSI-rendering keystroke-forwarding pane viewer with IME support just to let users type from the dashboard. digorgonzola's simpler pattern (write a `.command` file and `open` it so macOS launches whatever app owns shell scripts) gets the same outcome for far less code. This confirms Mesa's plan to open sessions with `tmux attach` in the user's terminal app is the lower-risk path; no source read here does that exact combination (tmux plus GUI-triggered attach), so it is not a validated pattern elsewhere, but the sources that avoid building a custom terminal all point the same direction.

4. **Keep permission handling out of the orchestrator process.** claude-code-monitor's remote-approval feature intercepts `PreToolUse`, polls a server for a decision, and writes `{"decision":"allow"|"deny"}` back to Claude Code, a real automation surface with its own auth, token, and password-hash requirements. digorgonzola's dashboard deliberately does not do this, reasoning that driving Claude Code's undocumented per-session IPC socket risks injecting bad input into running work, and instead always routes the human back into the actual session. Mesa's plan (detect PermissionRequest via hooks, then let the human answer inside the attached tmux window) matches the safer pattern; do not extend it into a remote-approve/deny bridge for v1.

5. **For the Obsidian memory vault, serialize writes through a single process rather than letting every session write directly.** claude-obsidian is explicit that plain Markdown files in a normal directory are the point, but that "parallel agents cannot race the vault": workers return drafts only, and one orchestrator applies one recoverable transaction under a single process-lifetime lock with journaled, atomic writes. If more than one Mesa tmux window can write memory notes into the same vault concurrently, apply the same single-writer discipline rather than letting each Claude session write the vault directly.

### Direct answers

**Does any source use `claude agents --json` or the statusline JSON as a state source?** Yes for `claude agents --json`: tmux-claude-hatch (craftzdog) uses it as its only status source, and requires Claude Code >= 2.1.139 for the command to exist. No source read here uses statusline JSON for state; the others rely on hooks (eyes-on-claude-code, claude-code-monitor, claude-activity-monitor, claude-monitor), transcript files (claude-monitor, claude-code-dashboard, CCSM), or pane-text parsing (claude-tmux).

**Does any source run Claude in tmux and attach from a GUI?** Not exactly as Mesa plans. eyes-on-claude-code is a GUI (Tauri) that works alongside tmux sessions, but instead of shelling out to `tmux attach` it embeds a custom polling pane viewer with keystroke forwarding. claude-tmux and tmux-claude-hatch run Claude in tmux with popups and pickers, but they are themselves tmux-side TUIs, not separate GUI apps. digorgonzola's dashboard is GUI-adjacent (local web dashboard) and does open the user's real terminal app to resume a session, but it does not use tmux at all, it discovers plain `claude` processes directly. No source combines a GUI with a literal `tmux attach` the way Mesa's design does.
