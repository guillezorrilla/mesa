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

`classifySession` in packages/core/src/decisions/session-state.ts asks one Choice over the six states, one Score for attention, and one Noul ("a human is needed now") through `decide`. Its fixtures are in `decisions/fixtures/state/`.

- A hook event more than a minute old gets 0.8, unless the listing agrees with it, in which case it gets 0.95.
- A hook event that means nothing for state is skipped in favour of the one before it: a `Notification` of type `permission_prompt`, or a `PreToolUse` for another tool.
- Tail patterns score 0.6. That is the cap from the "tail is display" amendment, and the low end of #25's 0.6 to 0.8.
- The tail is read only when neither a hook nor the listing speaks. It uses CCManager's Claude Code markers (ADR-0005, attributed in the file header), split into a permission wait and a question wait by the screen's own words.
- A waiting hook event yields to a listing that disagrees only once it is more than 2 s old. The listing trails the hook by about 0.3 s, and the spike saw it read `busy` just after a PermissionRequest.
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

**Following the new id (#92).** The record follows the listing and the `SessionStart`, and a `SessionEnd` with reason `clear` no longer ends the session. Until #92 lands, two things go wrong:
- that `SessionEnd` reads as `done`;
- the nested-claude guard drops every later event.

## Amendment 2026-09-26: tmux reports an agent's exit itself (#68)

The tmux signal was read on each look, so an agent that exited was noticed only at the next `mesa sessions`. Mesa's server now carries one global `pane-died` hook, only on the profile's own socket. `ensureServer` sets it on every start, and each look at a board with sessions sets it again (without starting a server), so a server an older mesa started gets it too. It runs `run-shell -b "<mesa> --profile <profile> hook tmux pane-died -- #{q:session_name} #{q:window_name}"`.
- **Quoting.** `-b` keeps one slow hook from holding up the next pane's. `#{q:...}` shell-quotes the names tmux fills in, and a `#` in Mesa's own path is doubled so tmux's formats leave it alone.
- **The state.** The handler records the exit at once: `done` for exit status 0, `failed` for another status or a signal. The confidence is the tmux signal's 0.85 (a process fact), the source is `tmux-hook`, and the record gets an `exited` event. A later look keeps that state.
- **Not a stop.** The owner decided the hook does not set `endedAt`, which means stopped. A crashed agent keeps `failed` attention and its last screen on the board, and `mesa stop` still removes its window and closes its receipt.
- **Which window.** tmux names the session last active, which is a terminal's `_view-` session when one is attached, so the handler matches the window by its name, which holds the Mesa id. Anything that is not a Mesa window of this profile is left alone, with exit 0.
- **Reporting.** `mesa hooks status` reports whether a server runs and whether it has exactly this mesa's hook. `mesa doctor` warns when the hook is missing (none is needed without a server) or when Claude Code's hooks are.

Evidence: tmux 3.7c, checked live. `show-hooks -g pane-died` prints `pane-died[0] <command>`, and `set-hook -g` replaces the hook's list, so starting again leaves one. A pane that dies runs the hook with its names filled in, within a second (packages/core/src/sessions/tmux.test.ts), and a hostile window name reaches the shell as one word. Without `-b`, two hooks ran one after another. In the #68 reviews, the hook took about 115 ms warm, and an attached view named the pane's session.
