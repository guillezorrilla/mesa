# ADR-0029: Structured view runs in a process Mesa hosts inside the session's tmux window

Status: accepted
Date: 2026-11-14

## Context

The owner decided a session has two views, Structured and Terminal, and that the terminal-backed Chat mode (CONTEXT.md, #1174) is retired. Chat mode reads the agent's native transcript and types into the pane, so it cannot show a reply as it streams, answer a permission request as data, or run a slash command without scraping the pane. The agents have structured interfaces that do. The question was where that process lives: ADR-0001 says a session is a tmux window, and the list, kill, attach, hooks (ADR-0003), `mesa report` and the phone all read windows.

## Decision

Mesa hosts the agent inside the session's tmux window and keeps ADR-0001 true. `mesa host <session>` runs `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompt-tool stdio` (Codex follows through `codex app-server`), appends every event to a journal in the session's folder under the profile, and serves a unix socket in the profile. The window shows a status line, not the TUI.

- Terminal view is the same session id resumed with the TUI in that window (`claude --resume <id>`); Structured is the reverse. A switch stops the host or the TUI and starts the other. Two processes on one session id are refused, and a switch while the agent is mid-turn asks first, then interrupts, stops and resumes.
- `mesa send` to a Structured session writes a user message to the socket, after the same guardrail check. Claude queues a message sent mid-turn; Codex has `turn/steer`.
- State is unchanged (ADR-0003): the hooks fire in the window with `MESA_SESSION_ID`. The stream's turn start and end are a second signal.
- `mesa report`, handoff and child sessions are unchanged: they run as tool calls inside the agent and go through `send` and `report`.
- Permission and question requests arrive as `control_request` and feed the existing Pending prompt cards, so the app, the CLI and the phone answer them without reading the pane.
- `mesa logs` reads the journal for a Structured session; the pane is no longer the record.
- Terminal stays the default view for a new session, with a Settings choice for Structured. The app's view control keeps the label Chat for Structured view.

## Evidence

docs/spikes/structured-chat.md (#1185, merged), measured 2026-11-14 on macOS, tmux 3.7c, `claude` 2.1.325 with a subscription login, `codex-cli` 0.162.1:

- Stream: first text delta 1.1 to 2.3 s after the prompt; a permission `control_request` arrived at 2.8 to 3.4 s, and `allow` ran the tool, `deny` was not retried; an interrupt was acknowledged in 20 ms and the next prompt on the same process answered normally.
- Switch: spawn to `system/init` p50 0.97 s, p95 1.46 s (n=10); Terminal spawn to ready prompt p50 1.6 s, p95 4.0 s (n=8, minimal config, so the owner's plugins will add to it); resume plus a one-line answer 2.9 to 6.1 s (n=5). A conversation survived a switch in both directions, and survived a SIGTERM after 15 deltas.
- Hooks: SessionStart, UserPromptSubmit, PreToolUse, Stop and SessionEnd all fired in stream-json mode, in that order. PermissionRequest and Notification were not exercised.
- Slash commands sent as a message: `/context`, `/usage`, `/cost`, `/model`, `/config`, `/compact`, `/clear`, project commands and skills work; `/permissions` is not available.
- Not measured: Codex live (read from `codex app-server generate-json-schema` only), the session id after `/clear`, the half-written reply after a kill, two processes on one id, startup with the owner's full plugin and MCP set.

## Options weighed

- **A second session backend** (the host process outside tmux, a new kind of session). Rejected: every reader of windows (list, kill, attach, hooks, `mesa report`, the phone) would learn a second kind of session, and ADR-0001's alternative, a process tied to the app, was already rejected for the same restart reasons.
- **ACP** (Agent Client Protocol). Not chosen, and not investigated: the spike found no `acp` subcommand in `codex --help` (0.162.1) and no ACP in Claude Code, so it would be an adapter in front of each agent, and the native protocols already cover what the chat needs. Revisit if an agent ships one.
- **The Agent SDK.** Not chosen, and not measured: the spike notes it is the same binary, so it adds a dependency without a capability the stream-json runs lacked, and an API key would bill per token where the subscription login measured here does not. Revisit if the stream-json interface breaks.
- **Keep Chat mode** (the transcript and the pane). Rejected by the owner: no live stream, and slash commands and prompts depend on pane diffs.

## Consequences

- A host crash loses the process, not the session: resume should start it again (the spike resumed after killing the process mid-turn, but did not crash a host). The journal keeps what was streamed.
- The merged chat renderer carries over; its source changes from the pane and the transcript to the stream, with the transcript still the history and reload source.
- Command cards for Structured sessions come from message output, not pane diffs; the marker path goes once the app is on the stream.
- Codex's Structured view waited on a live measurement of `codex app-server`. It was measured on 2026-11-14 (spike section 3, #1206), and `mesa host` has run Codex through it since #1202, behind the same runner seam (`agents/runner.ts`).
- ADR-0001 and ADR-0003 carry a note pointing here.
- 2026-11-16 (#1222): the chat's follow (`mesa chat --follow`, one per open chat) is also a request channel. A JSON line on its stdin runs one of the chat's actions for its session (`followedSession`: send, answer, prompt, sessions model, mode, controls, config) in that process and prints the envelope back as a `reply` line, so an action skips the ~300 ms mesa start; the app falls back to a new mesa when the follow cannot take it. Measured on a Haiku session: answering 1.0 s to 0.08 s, a model change 0.53 s to 0.31 s. A request still out when the follow ends is reported lost, never sent again. Open: whether this channel should replace the bridge for every session command.
