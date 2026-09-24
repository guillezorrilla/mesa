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

## Amendment 2026-09-24: v1 is Claude Code only

The owner asked to ship Claude Code first and add Codex later. Every P2 issue implements the Claude path only; the Codex paths (hooks in config.toml, `codex` open and resume commands, `codex agents`, Codex tail patterns, `codex exec` for headless runs) are collected in one follow-up issue in P3. The signal design above is unchanged. The board's "open its terminal" action in v1 opens the session in the user's terminal app attached to the tmux window (`mesa attach`); the embedded xterm terminal is optional for the week-one target.
