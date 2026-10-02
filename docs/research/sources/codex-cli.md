# OpenAI Codex CLI 0.154.0, Verified Facts

Scope: verify technical claims about Codex CLI for project planning. No Codex turns were started; nothing under `~/.codex` was changed. Today's date: 2026-09-24. Installed version confirmed locally: `codex --version` -> `codex-cli 0.154.0`.

Sources used:
- Local: `codex --help`, `codex exec --help`, `codex resume --help`, `codex fork --help`, `codex exec resume --help`, `codex app-server --help`, `codex app-server daemon --help`, `codex mcp --help`, `codex mcp-server`, `codex agents --help`, `codex review/queue/features/debug --help`, `~/.codex/config.toml` (redacted), `~/.codex/sessions` layout, a rollout JSONL file, `~/.codex/AGENTS.md`, `~/.codex/skills`.
- Official docs site: `https://developers.openai.com/codex`, as of 2026-09-24 this 308-redirects to `https://learn.chatgpt.com/docs` (OpenAI moved the Codex docs to the ChatGPT/Learn domain). Sub-pages such as `/codex/noninteractive` redirect to `https://learn.chatgpt.com/docs/non-interactive-mode`.
- GitHub repo `openai/codex`: the `docs/*.md` files at tag `rust-v0.154.0` (and `main`) have been reduced to short stubs that point to the `developers.openai.com/codex` site rather than containing full prose, so most citations below are the actual Rust/TypeScript source (still first‑party/official, in the same repo) via Context7 (`/openai/codex`, version `rust-v0.154.0`, which exactly matches the installed CLI).
- Context7 library `/openai/codex` (`rust-v0.154.0`), resolved 2026-09-24.

Note on the local environment: `~/.codex/config.toml` in this environment has many third‑party plugins/marketplaces installed (ponytail, warp, claude-plugins-official, etc.) and a populated `[hooks.state]` table. That table is genuine evidence that Codex 0.154.0 has a hooks system (see item 3), but the specific hook scripts registered there belong to third‑party plugins, not to Codex itself.

---

## 1. `codex exec` non-interactive usage

Status: **verified locally + officially**.

- `codex exec [OPTIONS] [PROMPT]` runs Codex non-interactively (alias `codex e`). Source: `codex --help`, local, 2026-09-24.
- **Prompt from stdin**: "If not provided as an argument (or if `-` is used), instructions are read from stdin. If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block." Verified locally (`codex exec --help`) and in source `codex-rs/exec/src/cli.rs` (Context7, accessed 2026-09-24).
- **`--json`**: "Print events to stdout as JSONL." Verified locally, `codex exec --help`. The TypeScript SDK still spawns `codex exec --experimental-json` internally (`sdk/typescript/src/exec.ts`), so `--experimental-json` is an older/alternate spelling seen in SDK code; the installed 0.154.0 binary's public flag is `--json`. **Open question**: whether `--experimental-json` still works as a hidden alias, not verified (would require running a turn).
  - JSONL event types (top-level `ThreadEvent` enum, tag `"type"`), source `codex-rs/exec/src/exec_events.rs` and `sdk/typescript/src/events.ts` (Context7, official repo source, accessed 2026-09-24):
    `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.updated`, `item.completed`, `error`.
  - Item types inside `item.*` events (`ThreadItemDetails`): `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`.
  - The first `thread.started` event carries `thread_id`, usable to resume later.
  - Official doc page `https://learn.chatgpt.com/docs/non-interactive-mode` (accessed 2026-09-24) independently confirms the same event names and gives an example line: `{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"..."},"usage":{...}}`.
- **`--output-last-message <FILE>` / `-o`**: "Specifies file where the last message from the agent should be written." Verified locally.
- **`--output-schema <FILE>`**: "Path to a JSON Schema file describing the model's final response shape." Verified locally; official doc page confirms it requests a final response conforming to the schema.
- **`-C, --cd <DIR>`**: "Tell the agent to use the specified directory as its working root." Verified locally.
- **`--full-auto`**: **Not shown in `codex exec --help` or any other local `--help` output in 0.154.0.** Source `codex-rs/exec/src/cli.rs` (Context7) shows it still exists as a *hidden* (`hide = true`) legacy-compatibility flag ("Legacy compatibility trap for the removed `--full-auto` flag") that maps to `SandboxMode::WorkspaceWrite` and conflicts with `--dangerously-bypass-approvals-and-sandbox`. Treat `--full-auto` as removed/deprecated in 0.154.0, kept only for old scripts.
- **`--sandbox` / `-s`** values (verified locally, `codex exec --help`): `read-only`, `workspace-write`, `danger-full-access`.
- **`-a/--ask-for-approval`**: **Not present on `codex exec` in 0.154.0.** Verified locally by reading the full `codex exec --help` output twice, no `-a`/`--ask-for-approval` flag is listed. Source `codex-rs/tui/src/cli.rs` (Context7) confirms `--ask-for-approval` is defined on the root/interactive `Cli` struct, not on `exec`'s `SharedCliOptions`; it does appear on `codex` (root), `codex resume`, and `codex fork` (verified locally on all three) but not on `exec`, `queue`, or `app-server`. **Conflict**: the official doc page `learn.chatgpt.com/docs/non-interactive-mode` lists `-a/--ask-for-approval` under "Other Key Flags" for exec, this appears to be generic/aggregated doc prose that does not match the actual 0.154.0 binary's exec flag set. For `codex exec`, approval behavior is instead controlled via `-c approval_policy=<value>`, `--approve-for-me`, or `--dangerously-bypass-approvals-and-sandbox` (all confirmed locally on `codex exec --help`).
- **`--model` / `-m`**: "Model the agent should use." Verified locally.
- **`-c key=value`**: "Override a configuration value... dotted path... value parsed as TOML." Verified locally on every subcommand.
- **`--skip-git-repo-check`**: "Allow running Codex outside a Git repository." Verified locally and in source.

---

## 2. Sessions, resume, fork

Status: **verified locally + officially (source)**.

- **Session/thread id sources**:
  - From `--json` output: the first `thread.started` JSONL event's `thread_id` field (source `exec_events.rs`, Context7).
  - From the rollout file on disk: the first line, `type: "session_meta"`, `payload.id` (and `payload.session_id`). Verified locally by reading a real rollout file: `{"timestamp":"...","type":"session_meta","payload":{"session_id":"01a0b20b-...","id":"01a0c1dc-9cd0-7c11-9228-092a135c4293","parent_thread_id":"...","cli_version":"0.153.4","cwd":"...","originator":"Codex Desktop",...}}`.
  - From the notify payload: `thread-id` and `turn-id` fields (see item 3).
- **`codex resume [SESSION_ID] [PROMPT]`**: picker by default; `--last` continues most recent; `--all` disables cwd filtering and shows a CWD column; `--include-non-interactive` includes non-interactive sessions in the picker/`--last`. Verified locally and matches source `codex-rs/cli/src/main.rs` `ResumeCommand` (Context7).
- **`codex exec resume [SESSION_ID] [PROMPT]`**: "Resume a previous session by id or pick the most recent with `--last`." `SESSION_ID` accepts a UUID or "thread name." Verified locally.
- **`codex fork [SESSION_ID] [PROMPT]`** exists (top-level, interactive) and **`codex exec fork`** exists as a subcommand of `codex exec` too (listed in `codex exec --help`: `fork  Fork a previous session by id into a new session`). Both verified locally.
- **Rollout storage layout**: `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl`. Verified locally (directory listing, e.g. `~/.codex/sessions/2026/09/20/rollout-2026-09-20T19-47-35-01a0c1dc-....jsonl`) and confirmed in source `codex-rs/rollout/src/recorder.rs::precompute_new_rollout_path` (Context7): `SESSIONS_SUBDIR = "sessions"`, path built as `codex_home/sessions/<year>/<month>/<day>/<filename>`.
- **File format**: JSONL, one JSON object per line, loaded via `load_rollout_items` (`codex-rs/rollout/src/recorder.rs`, Context7) which specifically looks for the first `RolloutItem::SessionMeta` line to establish `thread_id`. Locally verified: first line has `"type":"session_meta"` with an `id` and `session_id`.
- There is also `~/.codex/session_index.jsonl`, a flat index of `{"id","thread_name","updated_at"}` records (verified locally), separate from the per-session rollout files, apparently a fast lookup index.
- **`codex exec resume` via SDK**: TypeScript SDK spawns `codex exec --experimental-json resume <thread-id>` (source `sdk/typescript/src/exec.ts`, Context7).

---

## 3. Notify, hooks, and notifications

Status: **verified locally + officially (source)**, and this is the item with the most surprising finding.

- **`notify = ["cmd", ...]`** config: verified locally, `~/.codex/config.toml` line 1: `notify = [ "/path/to/SkyComputerUseClient", "turn-ended" ]`, confirms the array form (program + fixed args) that Codex then appends a JSON payload argument to.
- **Notify JSON payload**: source `codex-rs/hooks/src/legacy_notify.rs` (Context7, filename itself signals this mechanism is now considered "legacy"). It defines a single-variant enum:
  ```rust
  #[serde(tag = "type", rename_all = "kebab-case")]
  enum UserNotification {
      AgentTurnComplete { thread_id, turn_id, cwd, client: Option<String>, input_messages: Vec<String>, last_assistant_message: Option<String> },
  }
  ```
  Wire form uses kebab-case: `type: "agent-turn-complete"`, `thread-id`, `turn-id`, `cwd`, `client`, `input-messages`, `last-assistant-message`. This matches every field named in the task brief.
- **Does notify fire on approval requests?** No. The `UserNotification` enum in `legacy_notify.rs` has exactly one variant, `AgentTurnComplete`. There is no approval-request variant wired to the external `notify` command. **Fires only on turn completion.**
- **Hooks system beyond notify: yes, confirmed.** Codex 0.154.0 has a first-class hooks system (crate `codex-rs/hooks`), separate from and newer than the legacy `notify` mechanism:
  - `HookEventName` enum (`codex-rs/protocol/src/protocol.rs`, Context7), 12 events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt` (snake_case on the wire, e.g. `session_start`).
  - Config shape (from an integration test, `codex-rs/app-server/tests/suite/v2/session_end.rs`, Context7):
    ```toml
    [[hooks.SessionEnd]]
    matcher = "other"
    [[hooks.SessionEnd.hooks]]
    type = "command"
    command = "python3 {script_path}"
    timeout = 3
    ```
  - A hook receives a JSON payload on stdin; for the `Stop` event the schema (`codex-rs/hooks/src/schema.rs`, Context7) is `StopCommandInput { session_id, turn_id, transcript_path, cwd, hook_event_name, model, permission_mode, stop_hook_active, last_assistant_message }`, notably close to Claude Code's own Stop-hook shape.
  - CLI evidence: every local `--help` output shows `--dangerously-bypass-hook-trust`: "Run enabled hooks without requiring persisted hook trust for this invocation."
  - Local evidence: `~/.codex/config.toml` has a populated `[hooks.state."<plugin>:hooks/hooks.json:<event>:0:0"]` table with `trusted_hash` entries for events `post_tool_use`, `stop`, `session_start`, `user_prompt_submit`, `subagent_start`, `permission_request`, all real hook events being used, though by third-party plugins (ponytail, warp, expo, a local project) in this particular home directory, not by Codex core itself.
  - **This is a materially different (and much richer) mechanism than `notify`**; a project plan that only accounts for `notify` will miss it.
- **`tui.notifications`**: confirmed as a separate, TUI-only desktop-notification filter, distinct from both `notify` and the hooks system. Source `codex-rs/config/src/types.rs` + `codex-rs/tui/src/chatwidget/notifications.rs` (Context7):
  ```rust
  #[serde(untagged)]
  pub enum Notifications { Enabled(bool), Custom(Vec<String>) }
  ```
  Filterable `type_name()` values: `agent-turn-complete`, `approval-requested` (covers exec/edit/elicitation approval requests), `plan-mode-prompt`. This is the mechanism that *does* cover approval requests, but only as an in-TUI OS notification, not as an external process hook.

---

## 4. AGENTS.md

Status: **verified officially (source)**; local file existence verified.

- **Discovery order**: documented in the module doc of `codex-rs/core/src/agents_md.rs` (Context7, official repo source):
  1. Find the project root by walking up from cwd until a `project_root_markers` entry is found (default: `.git`; empty list disables traversal; no marker found -> only cwd is considered).
  2. Collect every `AGENTS.md` from the project root down to cwd, inclusive, concatenating contents **in that order** (root first).
  3. Does **not** walk past the project root.
  - This directly answers "global -> repo root -> cwd": it is actually **project root -> ... -> cwd**; the **global** `~/.codex/AGENTS.md` is loaded separately as `user_instructions` (see below), not as part of this per-directory walk.
- **`~/.codex/AGENTS.md`**: exists locally in this environment (8 bytes, content `@RTK.md`, i.e. the user's own global instructions file with an import reference, not part of Codex's own semantics). Per source, `load_project_instructions` takes `user_instructions: Option<Instructions>` (populated from the global file) and treats it as separate from, and not subject to, `project_doc_max_bytes`.
- **`AGENTS.override.md`**: mentioned in the same module doc header comment ("Collect every `AGENTS.md` (and `AGENTS.override.md`)...") per the earlier discovery-order excerpt, but I could not pull the exact override-vs-merge semantics (whether it fully replaces a directory's `AGENTS.md` or is concatenated alongside it) from the source in the queries run. **Not fully verified, flagged as an open question**, would need to read the full `agents_md.rs` file directly (not just the Context7 excerpt) to confirm.
- **`project_doc_max_bytes`**: config field confirmed in `codex-rs/core/src/config/mod.rs` ("Maximum total bytes of project instruction content across all selected environments"). Default: a reference config builder (`codex-rs/thread-manager-sample/src/main.rs`, Context7) sets `project_doc_max_bytes: 32 * 1024` (32 KiB / 32768 bytes), and the module doc for `agents_md.rs` independently states "capped by a `project_doc_max_bytes` budget (default 32 KiB)." Treated as **verified officially (source)**, though not cross-checked against a canonical `Default` impl.
- **`project_doc_fallback_filenames`**: config field confirmed to exist (`Vec<String>`, "Additional filenames to try when looking for project-level docs"). The same sample sets it to `Vec::new()` (empty) by default.
- **CLAUDE.md**: **no evidence Codex reads CLAUDE.md by default.** `project_doc_fallback_filenames` defaults to empty; CLAUDE.md would only be read if a user explicitly added it via `-c project_doc_fallback_filenames='["CLAUDE.md"]'` or equivalent config. Could not find any built-in reference to `CLAUDE.md` in the queried source. **Status: could not verify a "yes"; best evidence supports "no, not by default."**

---

## 5. Skills

Status: **verified locally + officially (source)**.

- Codex 0.154.0 supports skills. Confirmed locally: `~/.codex/skills/` exists with a `.system/` subfolder containing built-in skills (`review-agent`, `skill-creator`, `plugin-creator`, `skill-installer`, `openai-docs`, `imagegen`), each with a `SKILL.md`, an `agents/openai.yaml`, and optional `references/`, `scripts/`, `assets/`, matching the frontmatter/sidecar shape described in source.
- **SKILL.md frontmatter fields** (source `codex-rs/skills/src/parser.rs`, Context7): YAML frontmatter delimited by `---`, required `name` (max 64 chars, `MAX_NAME_LEN = 64`) and `description`; optional `metadata.short-description`. Example:
  ```yaml
  ---
  name: skill-creator
  description: Create or update a Codex skill
  metadata:
    short-description: Create or update a skill
  ---
  ```
- **Discovery directories**, source `codex-rs/ext/skills/src/host_roots.rs` (Context7), function `resolve_skill_roots_with_home_dir`:
  - `$CODEX_HOME/skills` (i.e. `~/.codex/skills`), marked "Deprecated user skills location... kept for backward compatibility" but still scanned.
  - `~/.agents/skills` (home-dir-relative, `AGENTS_DIR_NAME`/`SKILLS_DIR_NAME`).
  - A system cache root under the config folder (`SkillScope::System`).
  - Per-project **`.agents/skills`** directories, discovered by walking every directory between the detected project root and cwd (`repo_agents_skill_roots`, using the same `project_root_markers` logic as AGENTS.md), each mounted as a `SkillScope::Repo` root.
  - Plugin-provided skill roots (`plugin_skill_roots`).
  - Scan depth capped at `MAX_SCAN_DEPTH = 6`, up to `MAX_SKILLS_DIRS_PER_ROOT = 2000` directories per root, filename must be exactly `SKILL.md` (`SKILLS_FILENAME`).
- **Repo confirmation**: `~/Developer/personal/mesa/.agents/skills` exists locally (contains many skills, e.g. `research`, `domain-modeling`, `tdd`, etc., each with `SKILL.md`). Given the discovery logic above walks from the project root (this repo has `.git`, matching the default root marker) down to cwd looking for `<dir>/.agents/skills`, and this repo's `.agents/skills` sits at the project root, **this directory is in a location Codex 0.154.0 reads** (`SkillScope::Repo`), provided Codex is invoked with cwd inside this repo.
- **Invocation**: `/skills`, confirmed via local `codex-rs/tui/assets/tooltips.txt` tooltip string (Context7): "Use /skills to list available skills or ask Codex to use one." No evidence of a literal `$skill` invocation syntax was found in the sources queried (not verified either way for `$skill`).
- **`codex skills` subcommand**: **not present.** Verified locally, `codex --help`'s full command list (24 subcommands) does not include `skills`. Skill management instead happens through the built-in `skill-installer`/`skill-creator` skills themselves (their own scripts, e.g. `scripts/install-skill-from-github.py`, `scripts/list-skills.py`), not a dedicated `codex skills` CLI verb.

---

## 6. Programmatic state: app-server, mcp-server, SDK

Status: **verified locally + officially (source)**.

- **`codex app-server`**: `[experimental] Run the app server or related tooling`. Subcommands verified locally: `daemon`, `proxy`, `generate-ts`, `generate-json-schema`. Transport via `--listen` (`stdio://` default, or `unix://`, `ws://IP:PORT`, `off`); `--stdio` shorthand. This confirms JSON-RPC-over-stdio as the default transport, plus optional Unix-socket/WebSocket transports with auth (`--ws-auth capability-token|signed-bearer-token`, etc.), all verified locally.
- **Protocol methods** (source `codex-rs/app-server-protocol/src/protocol/common.rs`, Context7): client requests include `initialize`, `thread/start`, `thread/resume`, `turn/start`; client notification `initialized`; server notifications include `thread/started`, `turn/started`, `turn/completed`, `item/started`, `item/completed`, `item/agentMessage/delta`, `item/commandExecution/outputDelta`, `item/fileChange/patchUpdated`. A full example handshake (initialize -> initialized -> thread/start -> turn/start -> poll for `turn/completed`) is shown in `bazel/rules/testing/compat/exec_server_compat_test.rs` (Context7).
- **Approval requests as server-initiated requests**: confirmed. Source `codex-rs/exec/src/lib.rs` (Context7) shows the client handling `ServerRequest::CommandExecutionRequestApproval`, `FileChangeRequestApproval`, `ExecCommandApproval`, `PermissionsRequestApproval`, i.e., the app-server sends these as server-initiated JSON-RPC requests to the client, which must respond (see item 7 for how `codex exec` itself always rejects them).
- **`codex app-server daemon`**: manages a persistent local app-server daemon (`bootstrap`, `start`, `restart`, `stop`, `enable-remote-control`, `disable-remote-control`, `version`), verified locally. Source `codex-rs/app-server-daemon/README.md` (Context7) describes it as backing "machine-readable `codex app-server` lifecycle commands used by remote clients such as the desktop and mobile apps," explicitly still experimental.
- **`codex mcp-server`**: this exact subcommand name does **not** appear in the top-level `codex --help` command list (which instead lists `mcp`, for managing *external* MCP servers Codex connects to: `list/get/add/remove/login/logout`). However, running `codex mcp-server` (no args, no `--help`) locally produced `Error: stdin is not a terminal` rather than a clap "unrecognized subcommand" error, meaning the CLI *did* recognize `mcp-server` and attempted to start an MCP stdio server loop reading from stdin. Running `codex mcp-server --help` instead printed the full root help text (not a dedicated help page). Best interpretation: `mcp-server` is a hidden/legacy alias (same pattern as the hidden `--full-auto` trap) for making Codex itself act as an MCP server over stdio, kept for backward compatibility with older client configs, but no longer a first-class documented subcommand in 0.154.0. **Status: partially verified locally; exact flags/behavior not confirmed** (would require piping a real MCP stdio session, out of scope / risks starting a turn).
- **TypeScript SDK (`@openai/codex-sdk`)**: verified via source `sdk/typescript/src/codex.ts` and `sdk/typescript/README.md` (Context7):
  ```ts
  const codex = new Codex();
  const thread = codex.startThread();            // new Thread
  const turn = await thread.run("...");           // run
  ```
  `resumeThread(id)` resumes an existing thread by id. `runStreamed` was referenced in the task brief but not directly confirmed in the excerpts pulled; `codex.startThread()`/`thread.run()`/`codex.resumeThread()` are directly confirmed. A **Python** SDK also exists (`sdk/python`, Context7), with `Codex().thread_start(...)`, `thread.turn(...).run()`, `codex.thread_resume()`, `codex.thread_fork()`, `codex.thread_archive/unarchive/list()`, and `thread.compact()`, richer session-lifecycle surface than the TS SDK excerpt showed. Both SDKs shell out to the local `codex` binary (`codex exec --experimental-json ...` for TS) rather than talking to a remote API directly.
- **Which surface gives a live view of a session started elsewhere?** `codex agents`, `Browse all agent sessions on the shared local app-server daemon` (verified locally, `codex agents --help`). This is the one command that explicitly reads state from the **shared local app-server daemon**, i.e. it can show sessions/threads that were started by a different `codex` invocation (CLI, desktop app, etc.) as long as they're tracked by that daemon, rather than only sessions from the current process. The app-server protocol's `turn/started` / `item/started` / `item/completed` / `turn/completed` notifications (above) are the mechanism such a live view would use to show "working" vs "idle." I found no explicit "waiting for approval" *status* enum value in the excerpts pulled, that state is implied by an outstanding server-initiated approval request having no response yet, not a separate documented status field. **`codex mcp-server` and the SDKs, by contrast, each start/own their own thread(s) and were not evidenced to attach to an arbitrary externally-started session's live status** (the SDKs' `resumeThread`/`thread_resume` reopen a persisted thread to continue it, which is different from observing another process's in-flight turn). This distinction is inferred from the command descriptions and protocol shapes above, not from a single doc page stating it outright, flagged as the least directly "documented" sub-finding in this file.

---

## 7. Approvals

Status: **verified locally + officially (source)**.

- **`approval_policy` values**, source `codex-rs/protocol/src/protocol.rs`, `AskForApproval` enum (Context7):
  - `untrusted` (serde name `"untrusted"`, Rust variant `UnlessTrusted`)
  - `on-request` (Rust `OnRequest`, **default**, `#[default]`; serde also accepts alias `"on-failure"` for this same variant, per `#[serde(alias = "on-failure")]`)
  - `granular` (`Granular(GranularApprovalConfig)`), a variant not mentioned in the task brief's expected list, evidently newer.
  - `never` (`Never`)
  - Locally, `codex --help`/`codex resume --help`/`codex fork --help` only document two of these as `-a` possible values (`on-request`, `never`); `codex exec --help` shows none at all (no `-a` flag on exec, see item 1). Full config-level values must be set with `-c approval_policy=<value>`.
  - `codex-network.md` sample doc (Context7) clarifies: `--ask-for-approval never` (or `approval_policy` generally) only controls approval prompts, and does **not** by itself grant network access; that's separately controlled by `[sandbox_workspace_write] network_access = true`.
- **`sandbox_mode` / `--sandbox` values**: `read-only`, `workspace-write`, `danger-full-access`, verified locally on every subcommand's `--help` (`codex`, `codex exec`, `codex resume`, `codex fork`, `codex queue`) and matches `SandboxModeCliArg`/`SandboxMode` in `codex-rs/utils/cli/src/shared_options.rs` (Context7).
- **How approval prompts surface, by surface**:
  - **`codex exec` (non-interactive)**: approval requests are **never surfaced**, they are unconditionally rejected. Source `codex-rs/exec/src/lib.rs` (Context7): every `ServerRequest::{CommandExecutionRequestApproval, FileChangeRequestApproval, ExecCommandApproval, PermissionsRequestApproval}` is answered via `reject_server_request`, returning a JSON-RPC error (code `-32000`) with a message like `"command execution approval is not supported in exec mode for thread `<id>`"`. Practically: under a policy that would otherwise prompt, `codex exec` just fails that action and (per the CLI's own `--ask-for-approval never` help text pattern) execution failures are returned to the model to react to, rather than blocking for human input.
  - **TUI (interactive)**: approval requests render as an in-terminal modal/prompt; the underlying event sequence is `Event::ExecApprovalRequest` -> user responds `Op::ExecApproval::Allow/...` -> `Event::ExecStart`, per the sequence diagram in `codex-rs/docs/protocol_v1.md` (Context7). Desktop notifications for these are controlled by `tui.notifications` (`Notifications::Custom([...])`, `type_name() == "approval-requested"` covers exec, edit, and elicitation approval requests, see item 3).
  - **`codex app-server`**: approval requests arrive as **server-initiated JSON-RPC requests** to the connected client (e.g. `ExecCommandApproval`, `CommandExecutionRequestApproval`, `FileChangeRequestApproval`, `PermissionsRequestApproval`, the same request types `codex exec` rejects outright), which the client (desktop app, IDE extension, or any custom app-server client) must answer; this is how GUI clients implement their own approval UI. Verified via the same `codex-rs/exec/src/lib.rs` handler list and the app-server protocol method definitions in `codex-rs/app-server-protocol/src/protocol/common.rs` (Context7).
- **Policy vs. auto-deny nuance**: `default_exec_approval_requirement` (`codex-rs/core/src/tools/sandboxing.rs`, Context7) shows `OnRequest`/`Granular` return `NeedsApproval` (not auto-denied) when the filesystem sandbox is restricted; only `exec`'s own request handler is what turns "needs approval" into an outright rejection in non-interactive mode, the policy layer itself does not auto-deny under `on-request`.

---

## Verification summary

| Item | Status |
|---|---|
| 1. `codex exec` flags/JSON events | Verified (locally + source + official doc page). One real conflict found: official doc page lists `-a` for exec; the 0.154.0 binary does not have it. |
| 2. Sessions/resume/fork/rollout format | Verified (locally + source). |
| 3. Notify / hooks / tui.notifications | Verified (locally + source). Key finding: a full hooks system (12 events) exists beyond `notify`, which is now labeled "legacy" in the source tree. |
| 4. AGENTS.md | Mostly verified (source). `AGENTS.override.md` merge-vs-replace semantics not confirmed. CLAUDE.md: no evidence it's read by default. |
| 5. Skills | Verified (locally + source), including that this repo's `.agents/skills` is a location Codex reads. `$skill` syntax not confirmed either way; `codex skills` subcommand confirmed **absent**. |
| 6. app-server / mcp-server / SDKs | Mostly verified. `codex mcp-server` behavior only partially verified (recognized by the binary, but no dedicated `--help` text). "Live view of a session started elsewhere" answer (`codex agents`) is an inference from command descriptions, not a single explicit doc statement. |
| 7. Approvals | Verified (locally + source), including the exec-mode auto-reject behavior, which is the most actionable finding for automation planning. |

No item required stopping due to being blocked; all 5 numbered fetch/search rounds against the web (plus several Context7 source-code queries) returned usable material. Two `WebFetch` calls (advanced-config page, and a second config.md fetch) returned 404/empty content and are noted inline where relevant.
