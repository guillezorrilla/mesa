# Claude Code: verified technical facts

Access date for all sources below: 2026-09-24. Local environment: Claude Code 2.1.281, verified locally by running `claude --version`. Local project root used for on-disk checks: `~/Developer/personal/mesa`.

Primary official sources used:
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/cost-tracking
- npm registry: `@anthropic-ai/claude-agent-sdk` (checked with `npm view`)

Note on method: docs pages were retrieved with a fetch tool that runs a small summarizing model over the page and can occasionally compress or slightly mis-render a detail. Where a claim below is a direct quote it is high-confidence; where it is a paraphrase of a fetched summary I say so and, where it mattered, cross-checked against a second source (local CLI behavior, npm, or a second doc page).

---

## 1. Skills, status: verified official

Source: https://code.claude.com/docs/en/skills, accessed 2026-09-24.

- **File format**: "Every skill needs a `SKILL.md` file with two parts: YAML frontmatter between `---` markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."
- **Frontmatter fields**: `name` (optional, display name, defaults to directory name), `description` (recommended, used for automatic invocation), `disable-model-invocation` (blocks auto-invocation), `user-invocable` (set `false` for Claude-only skills), `allowed-tools`, `disallowed-tools`, `context: fork` (run in a forked subagent), `paths` (glob-scoped activation), `argument-hint`, `arguments`.
- **Locations**:
  - Project: `.claude/skills/<name>/SKILL.md` (loads for sessions in that repo), matches what this task found locally: `~/Developer/personal/mesa/.claude/skills/<name>/SKILL.md` (31 skills present, verified locally with `find`).
  - User/personal: `~/.claude/skills/<name>/SKILL.md` (all projects on the machine).
  - Nested: `<subdir>/.claude/skills/<name>/SKILL.md`.
  - Plugin: `<plugin>/skills/<name>/SKILL.md`.
  - Enterprise/managed: `.claude/skills/<name>/SKILL.md` under the managed settings directory.
- **Invocation**: "The directory name becomes the command you type" → `/skill-name`; a plugin skill is invoked as `/plugin-name:skill-name`.
- **Auto-invocation**: confirmed. "Claude uses skills when relevant, or you can invoke one directly with `/skill-name`." Selection is description-driven: "Claude's description and frontmatter [are used] to decide when to use the skill... the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing to reduce context usage." This matches the long skill-listing-with-one-line-descriptions behavior observed directly in this session's own system prompt.

## 2. Hooks, status: verified official, partially verified locally

Source: https://code.claude.com/docs/en/hooks, accessed 2026-09-24. Locally corroborated via `~/.claude/settings.json`, which has real, working `Notification` and `WorktreeCreate` hooks configured (read directly with `cat`).

**Full current event list** (much larger than the plan's assumed 10 events, all 10 assumed events exist, plus ~20 more): `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`. `WorktreeCreate` is locally confirmed live and in use (it exists in this user's real `~/.claude/settings.json`).

- **Common JSON stdin fields** (present on every hook event): `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort.level`, `hook_event_name`. Subagent runs add `agent_id` and `agent_type`.
- **Waiting on a permission prompt**: `PermissionRequest`, "When a tool call needs a permission decision." (`PermissionDenied` fires separately, only when auto mode denies a call.)
- **AskUserQuestion**: important correction to the plan's assumption, there is **no dedicated hook event for the built-in `AskUserQuestion` tool**. `AskUserQuestion` is an ordinary tool call (confirmed by the CLI docs' `--permission-prompts none` section, which lists `AskUserQuestion` among "tools that need an answer from a person"), so it fires the normal `PreToolUse`/`PermissionRequest` events with matcher `AskUserQuestion`. The `Elicitation` event is a **separate, MCP-specific** mechanism ("When an MCP server requests user input during a tool call") and should not be conflated with `AskUserQuestion`.
- **Stop vs. SessionEnd**: `Stop` = "When Claude finishes responding" (per-turn). `SessionEnd` = "When a session terminates" (per-session). `SessionEnd`'s matcher/reason values reported by the fetch were `clear`, `resume`, `logout`, `prompt_input_exit`, `other`, this list is a paraphrase of the doc, not a verbatim quote I could re-confirm character-for-character, so treat the exact value set as medium-confidence.
- **Notification**: fires "When Claude Code sends a notification." It carries a `notification_type` field, matched via the hook's `matcher`, with values including `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_stale`, `quota_auto_resume_disabled`. Same medium-confidence caveat as above (paraphrased, not verbatim-quoted).
- **Async/background hook commands**: yes. A command hook entry can set `"async": true` (runs in the background, non-blocking) or `"asyncRewake": true` (runs in background and wakes Claude on exit code 2).
- **Configuration locations (settings.json scopes)**: `~/.claude/settings.json` (user, machine-local), `.claude/settings.json` (project, committed/shared), `.claude/settings.local.json` (project, gitignored/local), managed policy settings (org-wide, admin-controlled), plugin `hooks/hooks.json`, skill frontmatter (active for the rest of the session once invoked), subagent frontmatter (active while that subagent runs).
- **JSON shape**: `{"hooks": {"<EventName>": [{"matcher": "<pattern>", "hooks": [{"type": "command", "command": "...", "args": [...], "timeout": 600, "statusMessage": "...", "if": "..."}]}]}}`. `type` can be `"command"`, `"http"`, `"mcp_tool"`, `"prompt"`, or `"agent"`. Verified locally: this user's actual `hooks.Notification` and `hooks.WorktreeCreate` entries in `~/.claude/settings.json` use exactly `matcher` + `hooks: [{type: "command", command, timeout}]`.
- **Environment variables passed to hook processes**: `CLAUDE_PROJECT_DIR` (project root), `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_EFFORT`, `CLAUDE_CODE_REMOTE`, `CLAUDE_CODE_BRIDGE_SESSION_ID`. **Verified locally**: this user's own `WorktreeCreate` hook command literally reads `$CLAUDE_PROJECT_DIR` (`main_env="$CLAUDE_PROJECT_DIR/.env"`), proving the variable is real and in active use, not just documented. **No dedicated env var carries the session id**, the session id is only available via the `session_id` field in the JSON stdin payload, not as an environment variable.

## 3. Headless mode, status: verified locally + verified official, with one flagged discrepancy

Sources: `claude --help` and `claude -p --help` run locally (Claude Code 2.1.281); https://code.claude.com/docs/en/cli-reference and https://code.claude.com/docs/en/headless, accessed 2026-09-24.

- `claude -p "prompt"`: confirmed, both locally and in docs.
- `--output-format`: confirmed locally, choices exactly `"text"`, `"json"`, `"stream-json"` (only valid with `--print`).
- `--input-format`: confirmed locally, choices exactly `"text"` (default), `"stream-json"` (only valid with `--print`).
- `--max-turns`: **discrepancy**. The docs (cli-reference, fetched) describe it: "Limit the number of agentic turns (print mode only)... Example: `claude -p --max-turns 3 "query"`." But it is **absent** from the installed `claude --help` and `claude -p --help` output for v2.1.281 (verified locally, grepped the full help text for "turns" and "max", found only `--max-budget-usd` and the `--effort` level list). Not tested further (running an actual prompt was out of scope). Open question, flagged below.
- `--permission-mode` values: **discrepancy**. Docs (paraphrased fetch) list: `default, acceptEdits, plan, auto, dontAsk, bypassPermissions, manual` (7 values). The installed CLI's actual `--help` choices (verified locally, exact commander.js choices list) are only 6: `"acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"`, **no `"default"` value**. The headless doc separately calls the built-in starting mode "Manual" (capitalized, descriptive), which is consistent with `manual` being the real default rather than a `default` flag value existing. Treat the locally-verified 6-value list as authoritative; the doc's `default` looks like a summarizer artifact.
- `--dangerously-skip-permissions`: confirmed locally ("Bypass all permission checks..."). Related, also confirmed locally: `--allow-dangerously-skip-permissions` (makes bypass available without defaulting to it) and `claude agents --dangerously-skip-permissions` ("Alias for `--permission-mode bypassPermissions`").
- `--allowedTools` / `--allowed-tools`: confirmed locally and in docs; uses permission-rule syntax, e.g. `"Bash(git diff *)"`.
- `--append-system-prompt`: confirmed locally and in docs.
- `--json-schema`: confirmed locally (flag exists) and in docs: used with `--output-format json` to get schema-validated output in a `structured_output` field; invalid schemas fail with `Error: --json-schema is not a valid JSON Schema`.
- **JSON result fields**: `total_cost_usd` is directly confirmed by official docs (headless page: "the response payload includes `total_cost_usd` and a per-model cost breakdown"; also the Agent SDK cost-tracking page and TypeScript SDK's `SDKResultMessage` type both use `total_cost_usd`). `session_id` and `result` are directly confirmed (headless page: "structured JSON with result, session ID, and metadata"; example `jq -r '.result'`). `is_error`, `duration_ms`, `duration_api_ms`, and `num_turns` are corroborated by a cli-reference fetch and independently by third-party technical write-ups (a GitHub issue against anthropics/claude-code and several blog posts show the literal shape `{"type":"result","subtype":"success","total_cost_usd":...,"is_error":false,"duration_ms":...,"duration_api_ms":...,"num_turns":...,"result":"...","session_id":"..."}`), but I could not get the primary TypeScript SDK reference page to render the full `SDKResultMessage` type table verbatim (the page was too large for the fetch tool and got truncated before that section). Confidence: high for `total_cost_usd`/`session_id`/`result`, medium for `is_error`/`duration_ms`/`duration_api_ms`/`num_turns` (secondary-source corroborated, not verbatim-quoted from the primary type reference).

## 4. Sessions, status: verified locally + verified official

Sources: local filesystem inspection of `~/.claude/projects/`; https://code.claude.com/docs/en/sessions, accessed 2026-09-24.

- `--resume <session-id|name|path>`, `--continue`/`-c`, `--fork-session`: all confirmed locally in `claude --help` and in docs. `--session-id <uuid>` confirmed locally ("Use a specific session ID for the conversation (must be a valid UUID)").
- **Transcript storage**: confirmed locally, this machine has `~/.claude/projects/-Users-you-Developer-personal-mesa/<session-id>.jsonl` files (directly listed with `ls`). Docs confirm the exact rule: `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the working directory path "with non-alphanumeric characters replaced by `-`"; for paths whose converted name exceeds 200 characters, Claude Code truncates to 200 chars and appends a hash of the full path.
- **Line format**: official docs explicitly warn this is **not** a stable/public format: "Each line is a JSON object for a message, tool use, or metadata entry. The entry format is internal to Claude Code and changes between versions, so scripts that parse these files directly can break on any release." They point scripts at `/export` or the CLI's structured-output/hook interfaces instead. Locally observed line shapes include `{"type":"last-prompt",...}`, `{"type":"mode",...}`, `{"type":"permission-mode",...}`, and message-shaped entries with `parentUuid`, `isSidechain`, `attachment` fields, all carrying a `sessionId` field, consistent with "internal, versioned format."
- **Session id in the SessionStart hook payload**: yes, `session_id` is listed among the common fields present on every hook event's JSON stdin, which includes `SessionStart`. (See item 2.)

## 5. AGENTS.md, status: verified official

Source: https://code.claude.com/docs/en/memory, accessed 2026-09-24 (full page read, quoted verbatim below).

- **Does Claude Code read AGENTS.md when CLAUDE.md is missing?** Yes, by default. Quote: "Claude Code can read `AGENTS.md` as your project instructions, so a repository already set up for other coding agents works without adding a `CLAUDE.md`, an import, or a setting." Requires **Claude Code v2.1.277 or later**; this machine runs 2.1.281, so the feature is active. The docs also note: "Before v2.1.281, some sessions, such as those on Amazon Bedrock or with telemetry disabled, read `CLAUDE.md` files only", i.e. full support across all session types only became reliable in exactly the version installed here (2.1.281).
- **What happens if both CLAUDE.md and AGENTS.md exist?** By default Claude reads CLAUDE.md only and ignores AGENTS.md, per this exact table row: "An `AGENTS.md` and a `CLAUDE.md` or `CLAUDE.local.md` in your working directory or above it → Your `CLAUDE.md` files only."
- **/config toggle**: yes. Quote: "type `/config` in a Claude Code session to open the settings panel, then set **Project instructions** to one of these values": `claude-md-or-agents-md` (default), `claude-md-and-agents-md` (reads both, CLAUDE.md first then AGENTS.md), `claude-md` (CLAUDE.md only), `managed-only`. Also settable via settings file: `pluginConfigs["agents-md@builtin"].options.instructionFiles`.
- **Does `@AGENTS.md` import inside CLAUDE.md work?** Yes, explicitly documented as the recommended way to keep one shared file when Claude isn't reading AGENTS.md directly by default:
  ```markdown
  @AGENTS.md

  ## Claude Code
  Use plan mode for changes under `src/billing/`.
  ```
  Quote: "Claude reads the imported file first, then the rest."

## 6. Live session state, status: verified locally + verified official

Sources: `claude --help`, `claude agents --help`, and running `claude agents --json` locally; https://code.claude.com/docs/en/sessions, accessed 2026-09-24.

**Correction to the plan's assumption**: something *does* exist for this. `claude agents --json` is a real, documented, locally-tested command: "Print active sessions (interactive and background) as a JSON array and exit (for scripting; does not require a TTY)." Running it locally in this session returned:
```json
[{"pid": 13070, "cwd": "~/Developer/personal/mesa", "kind": "interactive", "startedAt": 1790272626805, "sessionId": "73f6556a-9092-4ea9-854a-db5147358552", "name": "mesa-90", "status": "busy"}]
```
Fields observed: `pid`, `cwd`, `kind` (`interactive`/`background`), `startedAt`, `sessionId`, `name`, `status`. The sessions doc corroborates this is the intended scripting surface: "...listings of running sessions, such as [agent view] and `claude agents --json` output."

Related commands confirmed locally in `claude --help`: `claude attach <id>`, `claude logs <id>`, `claude stop|kill <id>`, `claude rm <id>`, `claude respawn`. There is **no `claude sessions` command**, confirmed locally by the absence of any such subcommand in the full `claude --help` command list (`agents, attach, auth, auto-mode, doctor, gateway, import, install, logs, mcp, plugin|plugins, project, respawn, rm, setup-token, stop|kill, ultrareview, update|upgrade`).

What else exists, all confirmed:
- **Transcript files**: `~/.claude/projects/<project>/<session-id>.jsonl` (see item 4).
- **Hooks**: `SessionStart`/`SessionEnd`/etc. for reacting to lifecycle events (see item 2).
- **Statusline JSON input**: confirmed both locally (this user's `~/.claude/settings.json` has `"statusLine": {"type": "command", "command": "bash ~/.claude/statusline-command.sh"}`) and officially. The statusline command receives on stdin a JSON object documented with these top-level/nested fields: `cwd`, `session_id`, `session_name`, `prompt_id`, `transcript_path`, `model.id`, `model.display_name`, `workspace.current_dir`, `workspace.project_dir`, `workspace.added_dirs`, `workspace.git_worktree`, `workspace.repo.{host,owner,name}`, `version`, `output_style.name`, `cost.{total_cost_usd,total_duration_ms,total_api_duration_ms,total_lines_added,total_lines_removed}`, `context_window.{total_input_tokens,total_output_tokens,context_window_size,used_percentage,remaining_percentage,current_usage.*}`, plus `vim.mode`, `agent.name`, `pr.{number,url,review_state,kind}`, `worktree.{name,path,branch,original_cwd,original_branch}`.

## 7. Claude Agent SDK (TypeScript), status: verified official + verified locally (npm)

Sources: https://code.claude.com/docs/en/agent-sdk/typescript and https://code.claude.com/docs/en/agent-sdk/cost-tracking, accessed 2026-09-24; `npm view @anthropic-ai/claude-agent-sdk version` run locally.

- **Package name**: `@anthropic-ai/claude-agent-sdk` (TypeScript), confirmed in code samples (`import { query } from "@anthropic-ai/claude-agent-sdk"`).
- **Session ids / resume**: yes. `listSessions({dir, limit})` "discovers and lists past sessions with light metadata," returning `SDKSessionInfo[]` including `sessionId: string`. `getSessionInfo()` reads metadata for one session by id. `Options.resume: string` = "Session ID to resume."
- **Hooks**: yes. `Options.hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (default `{}`). `Options.includeHookEvents: boolean` streams hook lifecycle events (`SDKHookStartedMessage`, `SDKHookProgressMessage`, `SDKHookResponseMessage`) into the message stream.
- **Streaming events**: yes. `query()` "creates an async generator that streams messages as they arrive," returning a `Query` object that extends `AsyncGenerator<SDKMessage, void>`, confirmed both by the type description and by working code samples using `for await (const message of query(...))`.
- **Current npm version**: **0.3.281**, verified locally by running `npm view @anthropic-ai/claude-agent-sdk version`; `npm view ... time.modified` returned `2026-09-24T15:53:59.094Z` (same day as this check). Observation (not independently verified as intentional): the SDK's version suffix (`.281`) matches the installed Claude Code CLI's version (`2.1.281`), suggesting the two are released together, but this is an inference, not a documented claim.

---

## Open questions / blocked_on

`blocked_on: null`, the file was completed without being blocked; all 7 items have at least one official or local source. The following are genuine discrepancies worth resolving with a human or a second check, not fetch failures:

1. **`--max-turns`**: documented on the official cli-reference page but absent from the installed v2.1.281 binary's `--help` output. Needs either (a) an actual `claude -p --max-turns N` invocation (out of scope for this task) or (b) checking the Claude Code changelog for whether it was renamed/removed.
2. **`--permission-mode` value set**: docs (paraphrased) list a 7th value, `default`, that does not appear in the locally-installed binary's actual choices list. Recommend trusting the local, directly-observed 6-value list (`acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`) unless re-confirmed verbatim from the doc's source Markdown.
3. **`SessionEnd` reason/matcher values** and **`Notification` `notification_type`values** were retrieved via a summarizing fetch, not quoted verbatim character-for-character from the raw doc source. High confidence but not "verbatim quote" confidence.
4. **Exact `SDKResultMessage` field table** (TypeScript Agent SDK reference) could not be rendered in full by the fetch tool (page too large, truncated before that section). `total_cost_usd`, `session_id`, `result` are primary-source confirmed; `is_error`, `duration_ms`, `duration_api_ms`, `num_turns` are secondary-source corroborated only.
