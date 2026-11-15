# Spike: structured chat

Issue: #1184. Date: 2026-11-14. macOS, tmux 3.7c, `claude` 2.1.325 (Sonnet 5.5, subscription login, no API key), `codex-cli` 0.162.1.

Question: the owner decided Mesa gets two views, Structured and Terminal, and retires the terminal-backed chat. How do we build it, what of the merged chat carries over, and what are the issues?

Method: a throwaway git folder with a project `.claude/settings.json` (logging hooks only, `--setting-sources project` so none of the owner's hooks ran), a project slash command and skill, and invented prompts ("remember the code word HARBOR_44", "create made.txt containing tide"). Scripts are in `docs/spikes/structured-chat/`; nothing from the owner's account is in the repo (`/usage` output was read, its numbers were not kept).

## Recommendation

Structured becomes chat's engine: Mesa hosts `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompt-tool stdio` inside a tmux window (a small `mesa host` wrapper that also serves a unix socket), and Terminal is the same session id resumed with the TUI in that window. Everything that works on a tmux window today (list, kill, hooks, `mesa report`, the phone) keeps working because the process still lives in tmux and still gets `MESA_SESSION_ID`. The merged chat renderer carries over almost whole; only its source changes from the pane to the stream. Codex follows the same shape through `codex app-server`, but that half is read from the protocol schema and not yet measured live.

## 1. Claude Code, structured mode (measured)

| Probe | Command | Result |
| --- | --- | --- |
| Streaming | `claude_stream.py <dir> slash` (turn 1) | `stream_event` `content_block_delta` lines; first delta 1.1 to 2.3 s after the prompt; `result` carries `session_id`, `total_cost_usd` (list price, notional on a subscription), `usage`, `ttft_ms`. |
| Tool calls | `claude_stream.py <dir> perm` | `assistant` `tool_use` and `user` `tool_result` blocks, in order. |
| Permission requests | same, with `--permission-prompt-tool stdio` | A `control_request` `can_use_tool` (tool name and input) arrived at 2.8 to 3.4 s; answering `allow` ran the Write, `deny` made the agent say it could not write and not retry. Mesa can answer from the app, CLI or phone. |
| Interrupt | `claude_stream.py <dir> interrupt` | A `control_request` `interrupt` was acknowledged in 20 ms; the next prompt on the same process answered normally. |
| `system/init` | first stream line | Lists `slash_commands` (project command and skill included), `skills`, `tools`, `agents`, `mcp_servers`, `model`, `permissionMode`, `apiKeySource` (`none` = subscription). |
| Hooks | `hooks.log` of the first run | SessionStart, UserPromptSubmit, PreToolUse, Stop and SessionEnd all fired in structured mode, in that order, ADR-0003 unchanged. PermissionRequest and Notification were not exercised. |

Slash commands sent as a user message (`claude_stream.py <dir> slash`):

| Command | Headless result |
| --- | --- |
| `/context` | Works: a Markdown table (model, tokens, categories). Replace with a native context meter fed by the same text or by `usage`. |
| `/usage` | Works: plain text with session and weekly percentages. Native card, refreshed on demand. |
| `/cost` | Works, printed the same text as `/usage`. |
| `/model` | Works: no argument prints the current model and the list (`sonnet, opus, haiku, fable, best, opusplan, ...`); with an argument it sets it (not run). Native model picker. |
| `/config` | Works: prints `key=value` settings it accepts. Native settings form later, not first. |
| `/permissions` | `isn't available in this environment.` Replace with a native mode picker (`permissionMode` in init, `--permission-mode` at start) and an allowed-tools list Mesa owns. |
| `/compact` | Works: 8.8 s, 44.6k to 9.9k tokens, a `system/compact_boundary` event. |
| `/clear` | Works, no output, a `background_tasks_changed` event. Whether the session id changes was not checked. |
| project command, skill | Work: they expand and run a turn (`LANTERN_CMD_OK foo`, `LANTERN_SKILL_OK`). The slash menu can list them from `init`, not from a guess. |

Effort and model are start flags (`--model`, `--effort`) or `/model`; mode is `--permission-mode` or a `set_permission_mode` control request (not run).

Cost and auth: subscription login worked headless (`apiKeySource: none`, `/usage` says "using your subscription"); `total_cost_usd` is list price. An API key would bill per token; the Agent SDK is the same binary and was not measured separately.

## 2. Switching both ways with `--resume` (measured)

- Structured to Terminal: `claude --resume <id>` in tmux kept the whole conversation (HARBOR_44 was recalled in the TUI). Folder trust shows once per new folder; Mesa's projects are already trusted.
- Terminal to structured: `--resume <id>` after a TUI turn recalled the word and the TUI's question.
- Time, structured: spawn to `system/init` p50 0.97 s, p95 1.46 s (n=10, `init_time.py`; init is emitted when the first message arrives, so a no-token `/model` was sent). Resume plus a one-line answer took 2.9 to 6.1 s wall (n=5).
- Time, Terminal: spawn to ready prompt p50 1.6 s, p95 4.0 s (n=8, `tui_resume.sh`; minimal config, so the owner's plugins and MCP servers will add to it).
- Mid-turn: killing the structured process (SIGTERM) after 15 deltas, then resuming, left the conversation intact and the next answer correct. Whether the half-written reply is kept in the transcript was not checked. Two processes on one session id at once was not tried and should be forbidden.
- Dialog when the agent is mid-turn: "The agent is working. Wait for it to finish, or interrupt and switch." Interrupt is the 20 ms control request above, then stop the process, then resume.

## 3. Codex (schema only, not measured live)

A live `codex app-server` run was started and stopped before it ran (it needed a copy of the owner's `auth.json` in a throwaway `CODEX_HOME`), so none of this is timed. The driver is `codex_appserver.py`; run it with a throwaway `CODEX_HOME` to finish the measurement. From `codex app-server generate-json-schema` (0.162.1) and `docs/spikes/codex.md`:

- Protocol: JSON-RPC over stdio (`codex app-server`). Requests include `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/steer`, `turn/interrupt`, `thread/compact/start`, `thread/read`, `skills/list`, `model/list`, `account/usage/read`, `account/rateLimits/read`, `review/start`.
- Notifications: `item/agentMessage/delta`, `item/commandExecution/outputDelta`, `item/fileChange/patchUpdated`, `turn/diff/updated`, `turn/plan/updated`, `thread/tokenUsage/updated`, `hook/started`, `hook/completed`.
- Approvals and questions are server requests: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`. This is a better fit than Claude's, with `turn/steer` for a message mid-turn.
- Slash command replacements exist as methods (model, usage, compact, skills, review). ACP was not looked for in 0.162.1 (no `acp` subcommand in `codex --help`); Claude has no ACP of its own.
- `codex exec --json` stays the headless Faro adapter (`docs/spikes/codex.md`), not the chat engine: one turn, no approvals.
- Switch to its TUI: `codex resume <thread id>` exists; not timed. Hooks in app-server mode are announced (`hook/started`) but not checked.
- Throwaway-profile warning from the earlier spike applies: an app-server daemon on the owner's `CODEX_HOME` changes how a plain `codex` attaches.

## 4. Mesa fit

Decision: a process Mesa hosts in tmux, not a second session backend. ADR-0001 stays true (a session is a tmux window) and nothing that reads windows needs to learn a new kind of session.

- Host: `mesa host <session>` runs the agent in stream-json, keeps a journal of events in the profile's session folder, and listens on a unix socket in the profile. The window shows a status line, not the TUI. Terminal view: stop the host, `claude --resume <id>` in the same window; Structured: the reverse.
- `mesa send`: for a structured session it writes a user message to the socket (the guardrail checks it first, same function). While a turn runs Claude queues it (`queued_turn_count` in `result`), Codex has `turn/steer`.
- State (ADR-0003): hooks fire in structured mode with the window's `MESA_SESSION_ID`, so state is unchanged. The host also knows turn start and end from the stream, a second signal.
- Worker reports: `mesa report` runs as a Bash tool call inside the agent with `MESA_SESSION_ID`; unchanged. A report to a structured parent is a `mesa send` to its socket.
- Attach: shows Terminal view only; in Structured, attach offers "Switch to Terminal" (a switch, with the mid-turn dialog).
- `mesa logs`: the journal. The pane is no longer the record.
- Phone: reads the same chat items from the Mesa daemon; permission and question cards come from `control_request` instead of pane scraping.
- Orchestration (`mesa open`, `handoff`, children): unchanged, they go through `send` and `report`.
- Risks: a host crash loses the process but not the session (resume); two views at once must be refused; auth is the owner's login either way.

## 5. What of the merged chat carries over

By module name and the merged diffs (#1174 #1173 #1175 #1176 #1180 #1181); the design pass should confirm each.

| Piece | Fate |
| --- | --- |
| `ChatItem` model (`core/sessions/native/chat.ts`: messages, step runs, edited files) | Kept. Live items come from the stream into the same types; `sessionResponses` from native transcripts stays the history and reload source. |
| `ChatPanel`, `ChatComposer`, docked card, `MessageTime`, `MarkdownView` (#1180) | Kept, unchanged. |
| `StepRun`, `EditedFiles`, `turnEdits` (#1175, #1180) | Kept. Tool results arrive as data, so they stop depending on transcript polling. |
| `PromptCard`, `PendingPromptCard`, `usePendingPrompt` (#1175) | Kept; the source becomes a `control_request` instead of the pane. |
| `SlashMenu`, `useSlashMenu`, `slashMatches` (#1176) | Kept; entries come from `system/init`, with native cards for the commands in section 1. |
| `CommandCard`, `AnsiLines`, `useCommandPanel`, `useCommandMarkers`, `commandMarkers` (#1176) | Replaced for Structured (output is text, not a pane diff); `AnsiLines` stays for Terminal-adjacent views. |
| #1182 (live stream) and #1183 (live reply) | Superseded by the host stream; close them, point to epic issues 2 and 4. |

## 6. The epic

Order: 1, 2, 3, then 4 and 8 in parallel, then 5, 6, 7, 9, 10, 11. Sizes in agent hours: S under 2, M under 4.

1. `sessions: structured Claude runner and event types` (M). Spawn stream-json, parse events to typed values, resume, a fake in `@mesa/core/testing`.
2. `sessions: stream events into chat items` (S). Map deltas, runs and edits onto `ChatItem`, merged with the transcript history.
3. `sessions: mesa host in a tmux window` (M). Socket, journal, `view` on the session record, start with `--view structured|terminal`.
4. `sessions: mesa send and chat follow for structured sessions` (S). Guardrail first, queue mid-turn, `mesa chat --json` follows the host.
5. `sessions: answer permission and question requests from Mesa` (M). `can_use_tool` and questions to the existing cards, app, CLI and phone.
6. `sessions: native controls for model, effort, mode, context and usage` (M). Replace the TUI-only commands in section 1.
7. `sessions: switch between Structured and Terminal` (M). Resume both ways, mid-turn dialog, forbid two processes on one id.
8. `app: chat on the live stream, retire pane-scraped command output` (M). Wire `ChatPanel` to item 2; remove the `CommandCard` marker path.
9. `phone: chat from the host stream` (S).
10. `sessions: Codex structured runner on app-server` (M). Preceded by one S measurement issue that finishes section 3 live.
11. `docs: ADR and CONTEXT terms for Structured and Terminal views` (S). Amends ADR-0001 and ADR-0003 notes; defines Structured, Terminal, host.

## Not measured

Codex live (section 3); `/clear` session id; the half-written reply after a kill; PermissionRequest and Notification hooks in structured mode; Agent SDK differences and API-key cost; two processes on one session id; startup time with the owner's full plugin and MCP set.

## Reproduce

`python3 docs/spikes/structured-chat/claude_stream.py <dir> slash|perm|interrupt|resume [session id]`, `init_time.py <dir> <session id> <runs>`, `tui_resume.sh <dir> <session id> <runs>` (private tmux server `-L spikechat`), `codex_appserver.py <dir> start|resume` with a throwaway `CODEX_HOME`.
