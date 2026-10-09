# ADR-0003: Session state comes from agent hooks first, agent listings second, tmux tail last

Status: accepted
Date: 2026-09-24

## Context

The proposal named Claude Code hooks (SessionStart, UserPromptSubmit, Notification, Stop) and Codex notify as the state signals, with the tmux tail as fallback. Research (docs/research/sources/claude-code.md and codex-cli.md) changed the picture:

- Claude Code 2.1.281 has 32 hook events. `PermissionRequest` fires when Claude waits on a permission prompt. `AskUserQuestion` has no dedicated event; it is a normal tool call visible through `PreToolUse` or `PermissionRequest` with matcher `AskUserQuestion`. `Stop` is turn end; `SessionEnd` is session end with a reason. Hooks can be async. Every payload carries `session_id`, `transcript_path`, `cwd`, and `hook_event_name`. No environment variable carries the session id.
- `claude agents --json` exists and lists live sessions with `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, `status` (verified locally, status value `busy` observed).
- Codex 0.154.0 has a hooks system with `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `permission_request`, `stop`, and others, configured as `[[hooks.<event>]]` in config.toml. `notify` still works but is marked legacy in the source and fires only on turn completion, never on approvals. `codex agents` browses sessions on the local app-server daemon (inferred from command descriptions, to be verified in the spike).

## Decision

Three signal sources, in priority order, feeding Faro's state classifier:

1. **Hook events.** `mesa hooks install` writes idempotent entries into `~/.claude/settings.json` (SessionStart, UserPromptSubmit, PermissionRequest, PreToolUse with matcher AskUserQuestion, Notification, Stop, SessionEnd) and `~/.codex/config.toml` (session_start, user_prompt_submit, permission_request, stop, session_end where available, plus legacy notify as a fallback). Every hook runs `mesa hook <agent>`, which reads the JSON on stdin and appends one line to `~/.mesa/<profile>/sessions/events/<mesa-session-id>.jsonl`. Correlation uses the `MESA_SESSION_ID` and `MESA_PROFILE` variables set on the tmux window, which the agent process and its hook children inherit. When they are absent the hook exits 0 immediately.
2. **Agent listings.** `claude agents --json` and, if the spike confirms it, `codex agents`, plus the session files under `~/.claude/projects/<escaped-cwd>/` and `~/.codex/sessions/`. Used for liveness, for the agent session id when a hook was missed, and to show sessions not started by Mesa as read-only rows.
3. **tmux.** `pane_dead`, `pane_current_command`, `window_activity`, and the `capture-pane` tail, classified with pattern detectors in the style of CCManager's claude.ts and codex.ts (MIT). This is the only source for a session whose hooks are not installed.

Faro's rules backend maps these into one of `working`, `waiting-permission`, `waiting-question`, `idle`, `done`, `failed` with a confidence: a fresh hook event gives 0.95 or higher, an agent listing 0.85, a tail-only classification 0.6 to 0.8. The adapter backend is consulted only when the rules backend's confidence is below a profile-configured threshold.

## Evidence

docs/research/sources/claude-code.md, codex-cli.md, alternatives.md, all accessed 2026-09-24. `claude agents --json` run locally on 2026-09-24.

## Consequences

- The Notification hook is kept for idle detection but is no longer the permission signal.
- Codex hooks may require a trust step (`--dangerously-bypass-hook-trust` exists). The P0 spike records the exact behaviour and the event payloads for both agents.
- Transcript JSONL formats are documented as internal for Claude Code; Mesa reads only session ids and timestamps from them, never message content.

## Amendment 2026-09-24: tail is display, not truth

docs/research/sources/claude-agentic-os.md (11 setups surveyed) shows pane-text parsing is the least reliable signal and that tools reading `claude agents --json` (tmux-claude-hatch) and hooks (claude-activity-monitor) are the ones that hold up. Ordering stays hooks, then agent listings; the tmux tail is shown on the board as "last output" and used for state only when neither other source has spoken, with confidence capped at 0.6. Permission prompts are answered by the human inside the attached session, never relayed through Mesa.

## Amendment 2026-09-24: v1 is Claude Code only

The owner asked to ship Claude Code first and add Codex later. Every P2 issue implements the Claude path only; the Codex paths (hooks in config.toml, `codex` open and resume commands, `codex agents`, Codex tail patterns, `codex exec` for headless runs) are collected in one follow-up issue in P3. The signal design above is unchanged. The board's "open its terminal" action in v1 opens the session in the user's terminal app attached to the tmux window (`mesa attach`); the embedded xterm terminal is optional for the week-one target.

## Amendment 2026-09-24: observed Claude Code signals

docs/spikes/state-signals.md (issue #6: Claude Code 2.1.281 and 2.1.282, run live in a tmux window with temporary hooks) records the real payloads. Where they differ from the text above, the spike wins:

- The session id is in the environment. Every hook process has `CLAUDE_CODE_SESSION_ID` equal to the payload's `session_id`, next to `MESA_SESSION_ID`, `MESA_PROFILE`, and `TMUX_PANE` inherited from the tmux window. Correlation by `MESA_SESSION_ID` works as designed.
- `PermissionRequest` also fires for `AskUserQuestion`, 0.04 s after `PreToolUse`. `waiting-permission` is a PermissionRequest whose `tool_name` is not `AskUserQuestion`; `waiting-question` is PreToolUse with matcher AskUserQuestion, or a PermissionRequest for that tool.
- `mesa hooks install` also registers `PostToolUse`. None of the seven hooks above fires between an approval or an answer and `Stop`; PostToolUse does, so it marks the return to `working`.
- A user denial (Esc, or "No" on the prompt) fires no hook at all: PostToolUseFailure, PermissionDenied, Stop, and Notification stayed silent for 117 s. A waiting state from a hook therefore yields to a later `claude agents --json` poll that says `idle` or `busy`.
- `claude agents --json` reports `status` `idle`, `busy`, or `waiting`, and while waiting it adds `waitingFor` (`"permission prompt"` or `"input needed"`). The listing alone separates the two waiting states at 0.85. The row disappears on exit and on SIGKILL.
- Notification `permission_prompt` fires about 6 s into either kind of wait, with the same message, so it adds nothing over PermissionRequest. `idle_prompt` fires 60 s after Stop and not after a denied turn. Stop is the idle signal.
- SessionEnd (`reason: "prompt_input_exit"` after `/exit`) does not fire on SIGKILL. `failed` comes from tmux `pane_dead_signal` or a nonzero `pane_dead_status` with no SessionEnd, at 0.85: that is a process fact, not tail text, so the 0.6 tail cap does not apply. `StopFailure` (a turn ended by an API error) is the hook-level `failed` signal; it was not captured and stays unverified.

## Amendment 2026-09-25: agent listings on the board

Issue #23 wires the second signal into `mesa sessions`:

- Each call reads `claude agents --json` once, with a 2 s timeout. Any failure counts as an empty listing.
- A listed process belongs to the Mesa session whose tmux window it runs in (its pid is the pane pid, as the spike found). Failing that, it belongs to the newest open session that holds its agent session id. A `/clear` keeps the pane but not the id; a resumed conversation keeps the id but not the pane. A stopped session runs nowhere, so it never matches.
- A session the listing names is alive even without a window, so it is not marked `done` from tmux. Its listing status is shown as `agentStatus`. The record's state is left to Faro's rules (#25).
- Every other listed process is a foreign session, shown read-only. Its state comes from the listing alone, at 0.85. A wait the listing cannot name gets 0.6, and a status it has never shown gets 0.5.
- Sessions held by another profile's records are left out, so each profile's board shows only its own sessions. Mesa never acts on a foreign session.

## Amendment 2026-09-25: the rules, as built (#25)

`classifySession` in packages/core/src/sessions/signals/state.ts asks one Choice over the six states, one Score for attention, and one Noul ("a human is needed now") through `decide`. Its fixtures are in `sessions/signals/fixtures/state/`.

- A hook event more than a minute old gets 0.8, unless the listing agrees with it, in which case it gets 0.95.
- A hook event that means nothing for state is skipped in favour of the one before it: a `Notification` of type `permission_prompt`, or a `PreToolUse` for another tool.
- Tail patterns score 0.6. That is the cap from the "tail is display" amendment, and the low end of #25's 0.6 to 0.8.
- The tail is read only when neither a hook nor the listing speaks. It uses CCManager's Claude Code markers (ADR-0005, attributed in the file header), split into a permission wait and a question wait by the screen's own words.
- A waiting hook event yields to a listing that disagrees only once it is more than 2 s old. The listing trails the hook by about 0.3 s, and the spike saw it read `busy` just after a PermissionRequest.
- An idle hook does not yield to a listing that reads working while the `Stop` before it names running `background_tasks`: Claude's listing reads `busy` for as long as that work runs, and its notices start a turn with their own `UserPromptSubmit`. An `idle_prompt` after that `Stop` repeats it (#699).
- A session already `done` or `failed` stays that way when its window later vanishes.
- A state's start time is the hook event's time. For the listing and the tail, it is when the board first saw the state.
- A wait always outranks every other state on attention (CONTEXT.md, Attention score). The Score's spread between levels is its answer, not doubt, so it never sends a decision to the adapter; only Choice and Noul answers are checked against the threshold.

## Amendment 2026-09-25: the board reads every pane (#27)

The board shows each session's last output line, so every look captures each window's pane, including a dead pane, which keeps its last screen. For state, the tail is still the last resort: it is passed to the rules only for a live pane that no hook and no listing speaks for. That is one `capture-pane` per window per look, every 2 s in the app. This is cheap at a handful of sessions; batch the captures if boards grow.

## Amendment 2026-09-25: transcripts give context use, and /clear changes the agent session id (#70)

docs/spikes/context-use.md measured a session's context use from outside it, on Claude Code 2.1.283, against the status line at eleven points on 200k and 1M windows.

**Accuracy.** At rest, the largest difference was 0.48 points, the status line's own rounding. While a request is in flight, the transcript trails by that request (up to 11.7 points measured). Right after `/compact`, its last usage is stale until the next reply.

Three things change.

**Context use.** Mesa now reads more from transcripts than session ids and timestamps. From the last main-chain assistant message (not a sidechain, that is not a subagent's) it reads `message.model` and `message.usage`, with `type`, `isSidechain`, and `timestamp`. It also reads `compact_boundary` entries. It still never reads message content.
- That gives the record's `context: {used, window, at, source: 'transcript'}` (#75), with `used` in percent of `window`.
- The window is the model's native window, held to 200k when `CLAUDE_CODE_DISABLE_1M_CONTEXT` or a third-party provider is set. The transcript alone cannot tell those apart, since both report `claude-opus-5-5`. A model Mesa has not measured has no reading.
- The transcript format stays internal to Claude Code, as Consequences says, and Mesa now depends on the shape of these fields too.

**The agent session id is not fixed for a session's life.** The #23 amendment above already noted that `/clear` keeps the pane but not the id. The spike recorded the hooks:
- `/clear` fires `SessionEnd` with the old id and reason `clear`.
- It then fires `SessionStart` with the new id and source `clear`.
- `claude agents --json` reports the new id for the pane's pid.

**Following the new id (#92, done).** The record follows the listing and the `SessionStart`, and a `SessionEnd` with reason `clear` no longer ends the session. Before #92, two things went wrong:
- that `SessionEnd` read as `done`;
- the nested-claude guard dropped every later event.

#92 landed it: `recordHookEvent` moves the record to the id of a `SessionStart` with source `clear` and logs it (any other source under another id is still a nested claude's, and dropped); each look saves the id the listing names for the pane's pid; and `hookState` gives a `SessionEnd` with reason `clear` (or `resume`, whose agent also goes on) no state.

## Amendment 2026-09-26: tmux reports an agent's exit itself (#68)

The tmux signal was read on each look, so an agent that exited was noticed only at the next `mesa sessions`. Mesa's server now carries one global `pane-died` hook, only on the profile's own socket. `ensureServer` sets it on every start, and each look at a board with sessions sets it again (without starting a server), so a server an older mesa started gets it too. It runs `run-shell -b "<mesa> --profile <profile> hook tmux pane-died -- #{q:session_name} #{q:window_name}"`.
- **Quoting.** `-b` keeps one slow hook from holding up the next pane's. `#{q:...}` shell-quotes the names tmux fills in, and a `#` in Mesa's own path is doubled so tmux's formats leave it alone.
- **The state.** The handler records the exit at once: `done` for exit status 0, `failed` for another status or a signal. The confidence is the tmux signal's 0.85 (a process fact), the source is `tmux-hook`, and the record gets an `exited` event. A later look keeps that state.
- **Not a stop.** The owner decided the hook does not set `endedAt`, which means stopped. A crashed agent keeps `failed` attention and its last screen on the board, and `mesa stop` still removes its window and closes its receipt.
- **Which window.** tmux names the session last active, which is a terminal's `_view-` session when one is attached, so the handler matches the window by its name, which holds the Mesa id. Anything that is not a Mesa window of this profile is left alone, with exit 0.
- **Reporting.** `mesa hooks status` reports whether a server runs and whether it has exactly this mesa's hook. `mesa doctor` warns when the hook is missing (none is needed without a server) or when Claude Code's hooks are.

Evidence: tmux 3.7c, checked live. `show-hooks -g pane-died` prints `pane-died[0] <command>`, and `set-hook -g` replaces the hook's list, so starting again leaves one. A pane that dies runs the hook with its names filled in, within a second (packages/core/src/sessions/tmux/backend.test.ts), and a hostile window name reaches the shell as one word. Without `-b`, two hooks ran one after another. In the #68 reviews, the hook took about 115 ms warm, and an attached view named the pane's session.

## Amendment 2026-09-26: Codex runs interactively, embedded, read from rollouts and its screen (#158)

docs/spikes/codex.md (issue #43, codex-cli 0.154.0) recorded Codex's signals, and the owner decided the shape in #43's comments. This supersedes the "v1 is Claude Code only" amendment for interactive sessions: `mesa open --agent codex` starts Codex in a Mesa window, and stop, resume, send, and the board work for it. Its hooks come with #159 and its headless runs with #160; until then Codex has no hook state and no headless entry in `AGENTS`.

- **Embedded, off the daemon.** A plain `codex` attaches to a running app-server daemon, whose hooks then run with the daemon's environment (not the window's `MESA_SESSION_ID` and `TMUX_PANE`), and whose `/exit` only disconnects. Any `-c` override keeps the TUI embedded: Codex reuses the daemon only when the config is replayable. Every Mesa `codex` start and resume carries `-c mesa.embedded=true` (`CODEX_EMBEDDED` in agents.ts). The key is under Mesa's name, so it sets nothing Codex reads and overrides no setting of the user's; it is one constant, so the command line stays byte-stable. Checked live in #158 against a running daemon: no `← for agents` footer, `/exit` closed the pane, no warning for the unknown key, while a plain `codex` beside it attached. This rests on observed, undocumented behaviour, so `mesa doctor` warns (`codex daemon`) while `$CODEX_HOME/app-server-control/app-server-control.sock` exists, `CODEX_HOME` read from the environment Mesa runs with, else `~/.codex`.
- **The commands.** Start: `codex -c mesa.embedded=true [-- <goal>]`, the goal after `--` so a goal that is a subcommand's name (`review`) stays a prompt. Resume: `codex -c mesa.embedded=true resume <thread id> -C <recorded folder>`, run in that folder, so no directory picker stops it. Quit: `/exit`. Codex's paste detection can turn an Enter sent right after the text into a newline, so `send` and the quit wait 0.3 s (the entry's `submitDelayMs`) between the text and Enter; Claude's Enter still follows at once.
- **The agent session id.** Codex has no `--session-id`: it picks its thread id, and writes the thread's rollout at the first prompt. Until #159's SessionStart hook, each look at the board reads it for a Codex session that ran and has none: the newest interactive (`originator: codex-tui`) rollout under `$CODEX_HOME/sessions/<local YYYY/MM/DD>/` whose first line's `session_meta.payload.cwd` is the session's folder, that started after its window opened (and before its stop), and whose id no session holds. The day of the window's opening and the next are searched, for a start held past midnight. Sessions are matched newest window first, so two opened in one folder each get their own thread. A look fills it before the listing is matched, so a session's own thread is never a foreign row.
- **The listing.** `codex agents` is a TUI with no JSON, needs the standalone installer layout, and sees live state only for daemon-hosted sessions, so it is not the second signal. Codex's listing is its rollouts written in the last 10 minutes, from every date folder (a resumed thread keeps its original folder), by the injected clock, each with its thread id, folder, and start, and no pid or status. A rollout says nothing of what its session does now or whether its codex still runs, so a Codex listing row gives no state: a Mesa session it names is still read from its window and tail, and is not kept alive by it; a foreign one (`ext-<thread id>`, as it has no pid) is a guess at `working` at 0.5, as for a status a listing has never shown, until its rollout is 10 minutes old.
- **The screen.** Codex's tail patterns, at the tail's 0.6: the startup gates (folder trust, `Hooks need review`, and `Choose working directory to resume this session`) need a person, read as `waiting-question`; the approval dialog is `waiting-permission`; the working marker (`• Working (`, `esc to interrupt`) is checked before the composer's idle placeholder (`› Ask Codex to do anything`), which stays on screen while a turn runs. The last output line is the last `• ` line above the composer.
- **Not yet.** Codex sessions are not adopted, and their context use is not read.

Evidence: docs/spikes/codex.md, including its "Checked in #158" section; packages/core/src/agents/codex/ and its fixtures.

## Amendment 2026-09-27: Codex hooks (#159)

Mesa now installs seven Codex events in `$CODEX_HOME/hooks.json`, sharing Claude's JSON editing owner. Commands keep the same Mesa-window guard and silent tail, use `hook codex`, and have no timeout. Install is byte-stable when unchanged and uninstall leaves user hooks. Only Codex's TUI grants trust: Mesa reads each handler's `trusted_hash` under its actual file, event, group, and handler position in config.toml and never passes a hook-trust bypass. This records the presence of Codex's trust decision; Mesa does not reproduce Codex's internal hash recipe.

Codex's first SessionStart claims the window's record. Later events find the active record by payload `session_id`, while still requiring the calling environment to name a recorded Mesa Codex window. Unknown nested ids are dropped. A prompt-less SessionEnd logs `done` without claiming an id. The matched record id also reaches queue and receipt effects. Codex's Interrupt is `idle`, and SessionEnd is `done` regardless of reason; the other mappings and 0.95 confidence follow docs/spikes/codex.md. Claude's existing log-only fallback and `/clear` behavior stay intact.

Trust is TOML, including comments and multiline strings, so the reader uses smol-toml instead of matching text. Invalid config fails closed without echoing parser excerpts that might hold keys. The existing Doctor screen and CLI show installation and each event's recorded trust. Evidence: Codex hook fixtures and tests, CLI/Doctor tests, and the live check in docs/spikes/codex.md.

## Amendment 2026-10-03: rules only (ADR-0020)

ADR-0020 removed the adapter backend. The rules' reading is the session's state, sure or not, and no model is asked below the threshold. The signal order and confidences above are unchanged.
