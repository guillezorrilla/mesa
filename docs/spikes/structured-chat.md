# Spike: structured chat

Issue: #1184. Date: 2026-11-14. macOS, tmux 3.7c, `claude` 2.1.325 (Sonnet 5.5, subscription login, no API key), `codex-cli` 0.162.1 (section 3 also ran on 0.169.0).

Question: the owner decided Mesa gets two views, Structured and Terminal, and retires the terminal-backed chat. How do we build it, what of the merged chat carries over, and what are the issues?

Method: a throwaway git folder with a project `.claude/settings.json` (logging hooks only, `--setting-sources project` so none of the owner's hooks ran), a project slash command and skill, and invented prompts ("remember the code word HARBOR_44", "create made.txt containing tide"). Scripts are in `docs/spikes/structured-chat/`; nothing from the owner's account is in the repo (`/usage` output was read, its numbers were not kept).

## Recommendation

Structured becomes chat's engine: Mesa hosts `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompt-tool stdio` inside a tmux window (a small `mesa host` wrapper that also serves a unix socket), and Terminal is the same session id resumed with the TUI in that window. Everything that works on a tmux window today (list, kill, hooks, `mesa report`, the phone) keeps working because the process still lives in tmux and still gets `MESA_SESSION_ID`. The merged chat renderer carries over almost whole; only its source changes from the pane to the stream. Codex follows the same shape through `codex app-server`, measured live in section 3.

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

## 3. Codex on `codex app-server` (measured, #1187)

Measured 2026-11-14 under #1202 with a throwaway `CODEX_HOME` (`/tmp/cxh`, a copy of `auth.json` and a one-line `config.toml` with `model_reasoning_effort = "low"`, deleted afterwards) and a throwaway git folder, invented prompts. The app-server probes ran on `codex-cli` 0.162.1; the owner's install updated itself to 0.169.0 during the run, so the `codex resume` rows and the way back ran on 0.169.0. Commands assume `export CODEX_HOME=<throwaway>`; `D=docs/spikes/structured-chat`.

| Probe | Command | Result |
| --- | --- | --- |
| Start | any scenario | `initialize` answered 0.02 to 0.13 s after spawn; `thread/start` 0.48 s. |
| First delta | `RUNS=8 python3 $D/codex_appserver.py <dir> latency` | `turn/start` to the first `item/agentMessage/delta` on a new thread: p50 3.2 s, p95 3.7 s (n=8). |
| Approval, allow | `DECISION=accept python3 $D/codex_appserver.py <dir> approval` | `approvalPolicy: "untrusted"`: one server request `item/commandExecution/requestApproval` (`threadId`, `turnId`, `itemId`, the command); answering `{"decision": "accept"}` ran it, `made.txt` was written, then `serverRequest/resolved`. With `on-request` and `workspace-write`, a write inside the folder ran with no request at all. |
| Approval, deny | `DECISION=decline ... approval` | Same request; `{"decision": "decline"}` left no file, and the agent said "The command was rejected" and did not retry. |
| Interrupt | `python3 $D/codex_appserver.py <dir> start` (turn 3) | `turn/interrupt` mid-stream: `turn/completed` with `status: "interrupted"` 5, 7 and 167 ms later (n=3, too few for p95); the next `turn/start` on the same process answered normally. |
| Steer | `... steer` | `turn/steer` (`expectedTurnId` from `turn/started`) 3 s into a counting turn was acknowledged in 5 ms with the same `turnId`; the same turn ended `1 2 3 4 5 STEERED`. A message mid-turn needs no interrupt. |
| `model/list` | `... start` | 0.00 s, `data` and `nextCursor`. |
| `skills/list` | `... start` | 0.01 s, `data` per cwd. |
| `account/usage/read` | `... start` | 0.36 s: `summary`, `dailyUsageBuckets`, `threadUsage` (values not kept). `account/rateLimits/read` 0.24 s. |
| Compact | `... compact` | `thread/compact/start` answers `{}` at once and runs as a turn: `turn/started`, one item, `turn/completed` 12.7 and 19.6 s later (n=2: the `compact` and `start` scenarios). No `thread/compacted` arrived (the first driver waited for it and timed out). The code word was recalled after it. |
| Hooks | `... hooks`, then `TRUST=1 ... hooks` | The scenario writes `$CODEX_HOME/hooks.json` (Claude's JSON shape, one logging hook per event) when it is missing. These hooks are `untrusted` at first and do not run in app-server mode: no notification, no warning. `hooks/list` returns each with `key` (`<file>:<event>:0:0`), `currentHash`, `trustStatus`; one `config/batchWrite` of `hooks.state.<key>.trusted_hash = currentHash` with `reloadUserConfig` trusted them, and then SessionStart, UserPromptSubmit, PermissionRequest and Stop each fired with the thread id as `session_id`, each wrapped in `hook/started` and `hook/completed` notifications. Same result rerun on 0.169.0. The throwaway `config.toml` also held `trust_level = "trusted"` for the folder afterwards, with no prompt. |
| To the TUI | `bash $D/codex_tui_resume.sh <dir> <thread id> 10` | `codex -c mesa.embedded=true resume <id>` (Mesa's embedded override, without its `-C` and mount flags) in a private tmux server: prompt ready p50 0.38 s, p95 0.99 s (n=10); the TUI showed the app-server turns (the interrupt, the compact) and answered `HARBOR_44`. |
| Back to app-server | `python3 $D/codex_appserver.py <dir> resume <id>` (x5) | `thread/resume` 0.03 to 0.04 s, then the code word right every time (after the TUI turn), first delta p50 3.3 s, p95 4.6 s (n=5). A `thread/goal/cleared` notification came with each resume. |

Other shapes worth keeping: `item/completed` for an `agentMessage` carries `phase` (`commentary` or `final_answer`); a `commandExecution` item carries the command and cwd. Around a turn, `thread/status/changed`, `mcpServer/startupStatus/updated`, `turn/moderationMetadata`, `thread/tokenUsage/updated` and `account/rateLimits/updated` arrive and are not chat items.

A plain `codex resume` (no `-c`) on the throwaway home started an app-server daemon inside it (`$CODEX_HOME/packages/app-server-daemon/`), which outlived the TUI and whose updater moved it from 0.162.1 to 0.169.0 on its own. `codex app-server daemon stop` stopped the daemon but left the updater running; it was killed by hand. With `-c mesa.embedded=true` no daemon process was left.

`codex exec --json` stays the headless Faro adapter (`docs/spikes/codex.md`), not the chat engine. ACP was not looked for.

### For the runner (#1202, was #1197)

1. Start every thread with `approvalPolicy: "untrusted"` (or a policy Mesa maps from its mode picker) when the person wants approval cards; `on-request` with `workspace-write` writes inside the folder without asking. Answer `{"decision": "accept" | "decline"}` and clear the card on `serverRequest/resolved`, since another client may answer first.
2. Treat `thread/compact/start` as a turn: show it as running until `turn/completed`; do not wait for `thread/compacted`.
3. Keep `turn/started`'s `turn.id` per thread; `turn/steer` and `turn/interrupt` need it. A send while a turn runs is a steer, not a queued prompt.
4. Fold only `item/*` and `turn/*` into chat items; `agentMessage` `phase: "commentary"` is a step line, `final_answer` the reply. Token usage and rate limits feed the footer.
5. Hook trust is an app-server call: after `mesa hooks` writes `$CODEX_HOME/hooks.json`, read `hooks/list` and trust Mesa's own entries by `currentHash` with `config/batchWrite`, never other hooks. `mesa doctor` should report any Mesa hook whose `trustStatus` is not trusted, since untrusted hooks fail silently.
6. Terminal view keeps Mesa's `codex -c mesa.embedded=true resume <id>`; a plain `codex resume` starts a self-updating daemon. Stop the app-server process before the TUI resumes and back (two processes on one thread was not tried and should be forbidden, as for Claude).
7. Codex updates itself under Mesa (0.162.1 to 0.169.0 here, mid-run); pin nothing to a version, read `initialize`'s answer and fall back when a method is missing.

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
10. `sessions: Codex structured runner on app-server` (M). Section 3 lists what it must change.
11. `docs: ADR and CONTEXT terms for Structured and Terminal views` (S). Amends ADR-0001 and ADR-0003 notes; defines Structured, Terminal, host.

## Not measured

`/clear` session id; the half-written reply after a kill; PermissionRequest and Notification hooks in structured mode; Agent SDK differences and API-key cost; two processes on one session id; startup time with the owner's full plugin and MCP set.

## Reproduce

`python3 docs/spikes/structured-chat/claude_stream.py <dir> slash|perm|interrupt|resume [session id]`, `init_time.py <dir> <session id> <runs>`, `tui_resume.sh <dir> <session id> <runs>` (private tmux server `-L spikechat`), `codex_appserver.py <dir> start|approval|steer|latency|compact|hooks|resume [thread id]` and `codex_tui_resume.sh <dir> <thread id> <runs>` (private tmux server `-L spikecodex`), both with a throwaway `CODEX_HOME`. `switch_time.py <profile> <session> <runs>` times `mesa sessions view` both ways (#1201).
