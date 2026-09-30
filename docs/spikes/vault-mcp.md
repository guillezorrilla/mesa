# Spike: a per-session `mesa-vault` MCP server in Claude Code, Codex and Antigravity

Issue: #292 (first checklist item of #157). Date: 2026-09-29. macOS (Darwin 25.6.0), tmux 3.7c, Node v24.16.0. Claude Code 2.1.284 (Opus 5.5), `codex-cli 0.157.1` (GPT-6-Astra, reasoning effort low), Antigravity CLI 1.2.13 (Gemini 3.8 Flash, High).

**Outcome:** all three agents mount a hand-rolled stdio server, call `project_context`, and give the server the Mesa window's `MESA_SESSION_ID` and `MESA_PROFILE`. Claude Code needs nothing in the config for that. Codex needs `env_vars`, and Antigravity passes the whole window environment. Claude Code (`--allowedTools=mcp__mesa-vault`) and Codex (`default_tools_approval_mode="approve"`) pre-approve per launch, so no prompt appears in the TUI or headless. Antigravity has no per-launch pre-approval. Without a rule it prompted on every call and headless auto-denied the tool. With the global allow rule `mcp(mesa-vault/*)` in its settings, a headless and an interactive turn both called the tool with no prompt and no denial. The owner has since decided that `mesa hooks install` adds that rule. Claude and Codex mounts live in argv, so every resume has to repeat them. Antigravity's single global entry is also started by every `agy` process on the machine, including ones outside Mesa. The standing cost is fixed by the tool list and does not depend on vault size: 0 tokens for Claude and Codex, which defer MCP tools, 854 tokens for Claude with tool search off, and about 850 tokens for Antigravity.

## Method

- An invented git project `lantern-shoal` (README and one note, marker `GREY KELP 19`) and its `git worktree` `lantern-shoal-wt` under `/private/tmp/claude-501/p5spike/`. Two invented vaults: `vault-small` (3 notes) and `vault-large` (300 notes, 1.2 MB).
- Every interactive agent ran in a private tmux server started under `env -i` with only `HOME USER LOGNAME SHELL TERM LANG TMPDIR PATH` (`tmux -u -L p5spike -f /dev/null`, `remain-on-exit on`). Each window got `-e MESA_SESSION_ID=spike0NNN -e MESA_PROFILE=p5spike` to simulate a Mesa window. Mesa itself did not run. The agents were driven with `send-keys` and read with `capture-pane -p`.
- Claude Code used the real, signed-in HOME. Codex used a temporary `CODEX_HOME` holding a copy of `auth.json`, and its `config.toml` was written only by Codex's own folder-trust answer. Antigravity got one temporary global entry, `mesa-vault-spike`, and its config file was backed up first. A second, shorter run (below) used the entry name `mesa-vault` together with the allow rule.
- The server took `--log <file> --marker <word> --vault <dir>` in its argv. It logged every request, the `MESA_*` values it saw, and the names of its environment variables. It returned `marker=<word> session=<MESA_SESSION_ID or unset> profile=<...>`, so each answer shows which mount and which environment produced it.

## The throwaway server

A 150-line Node ESM script with no dependencies. It speaks newline-delimited JSON-RPC 2.0 on stdio and writes only JSON-RPC to stdout.

- `initialize` returns the client's `protocolVersion` when it is one of `2025-11-25`, `2025-06-18`, `2025-03-26` or `2024-11-05`, and otherwise `2025-11-25`. It also returns `capabilities: {tools: {}}` and `serverInfo: {name: "mesa-vault", version: "0.0.0-spike"}`.
- Any message without an `id` (every `notifications/*`) gets no reply. `ping` returns `{}`.
- `tools/list` returns the seven planned tools with object schemas (`additionalProperties: false`): `project_context` (no arguments), `read_note {path}`, `search_vault {query, project?, limit?}`, `session_goals {limit?}`, `save_decision {title, decision, rationale, probability?, confidence?}`, `save_summary {summary}`, `save_note {title, body, folder?}`. The response is 2,484 bytes. The tools array is 2,439 bytes compact, of which names and descriptions are 474 bytes. The bytes were identical (`cmp`) with the 3-note and the 300-note vault.
- `tools/call` returns `{content: [{type: "text", text}], isError: false}`. Only `project_context`'s text depends on the vault (its note count). An unknown tool gets `-32602`, an unknown method `-32601`, and unparsable input `-32700`. A local pipe test checked all of these, `ping`, and the fallback for an unknown protocol version.

What each client sent, from the server logs:

| Client | `clientInfo` | Sequence | Protocol asked | Other |
| --- | --- | --- | --- | --- |
| Claude Code | `claude-code 2.1.284` | `initialize`, `notifications/initialized`, `tools/list`, `tools/call` | `2025-11-25` | `tools/call` params carry `_meta: {"claudecode/toolUseId", progressToken}` |
| Codex | `codex-mcp-client 0.157.1` | the same | `2025-06-18` | none |
| Antigravity | `antigravity-client v1.0.0` | `server/discover`, then the same, plus `notifications/roots/list_changed` | `2026-07-28` in `server/discover`, then `2025-11-25` in `initialize` | Falls back to `initialize` only after `server/discover` gets `-32601` |

All three clients accepted `initialize`, `tools/list` and `tools/call` from the hand-rolled server, so the official SDK was not tried. No client sent `ping` in any of these runs. `ping` was checked only by the local pipe test. The exact `tools/list` result is in the appendix.

## Claude Code 2.1.284

Mount: `--mcp-config` with `{"mcpServers": {"mesa-vault": {"type": "stdio", "command": "node", "args": ["<server>", "--log", "<log>", "--marker", "<word>", "--vault", "<vault>"]}}}`, as a file or as an inline JSON string (both worked). There is no `env` block. Both `--mcp-config` and `--allowedTools` are variadic, so the `=` form keeps a goal placed after them as the prompt.

Fresh argv, in window `claude1` (`lantern-shoal`, `MESA_SESSION_ID=spike0001`):

```
claude --session-id 360ed2a1-f255-4c2a-8f30-ba7b6ea349f5 --mcp-config=/private/tmp/claude-501/p5spike/claude/mcp-small.json --allowedTools=mcp__mesa-vault 'Call the mesa-vault project_context tool and tell me the marker it returns. Use no other tools.'
```

| Path | Observation | Status |
| --- | --- | --- |
| Fresh, the user's default `auto` mode | After the folder-trust answer (the server started only then), Claude loaded the deferred tool through ToolSearch and answered `The marker is CLAUDE-FRESH-A1`, with session `spike0001` and profile `p5spike`. No permission prompt. | Verified |
| Environment | The server saw `MESA_SESSION_ID` and `MESA_PROFILE` with no config `env`. Claude passes its whole environment, including `TMUX`, `TMUX_PANE`, `CLAUDE_PROJECT_DIR` and `CLAUDE_CODE_SESSION_ID` (value not logged). | Verified |
| Pre-approval, `--permission-mode default` | In the worktree, with `--allowedTools=mcp__mesa-vault`, there was no prompt: `marker=CLAUDE-FRESH-A1 session=spike0002`. The same launch without `--allowedTools` stopped at `Tool use / mesa-vault - Project Context Tool: (MCP) / Do you want to proceed? 1. Yes / 2. Yes, and don't ask again for ... in <worktree> / 3. No`. It was answered `1. Yes`. | Verified: `--allowedTools=mcp__mesa-vault` pre-approves all seven tools |
| Worktree | `lantern-shoal-wt`, `MESA_SESSION_ID=spike0002`. No trust prompt appeared. The server's cwd was the worktree. The call succeeded as above. | Verified |
| `/compact` | `Compacted`. The same server process (pid 26188) answered the next call with `marker=CLAUDE-FRESH-A1 session=spike0001`. | Verified: still mounted |
| `/clear` | The same server process answered the next call with `session=spike0001`. On `/exit` Claude printed the new native ID `36905c13-a735-470b-b97d-24bd6a016314`. | Verified: still mounted, same window environment |
| Resume without the mount | `claude --resume 36905c13-...` started no server process: nothing in the log, no process. | Verified: the mount is not persisted |
| Resume with the mount | `claude --resume 36905c13-... --mcp-config=<file> --allowedTools=mcp__mesa-vault` started a new server process (pid 66375), which answered `marker=CLAUDE-FRESH-A1 session=spike0001`. | Verified: the relaunch must repeat both flags |
| Headless | `MESA_SESSION_ID=spike0004 claude -p '<same prompt>' --session-id <uuid> --output-format json --permission-mode default --mcp-config=<file> --allowedTools mcp__mesa-vault` exited 0 with `subtype: success`, `result: "marker=CLAUDE-FRESH-A1 session=spike0004"`, `num_turns: 3`, `permission_denials: []` and `total_cost_usd: 0.2367564`. | Verified |

Standing context from `/context`, with no prompt sent:

| Launch | Total | MCP tools line |
| --- | --- | --- |
| Other user MCP servers, no mount | 33.5k | `301 tools, 634 tokens (loaded on-demand)` |
| Other user MCP servers plus mount, 3-note vault | 33.5k | `308 tools, 634 tokens (loaded on-demand)` |
| Other user MCP servers plus mount, 300-note vault | 33.5k | `308 tools, 634 tokens (loaded on-demand)` |
| `--strict-mcp-config`, no mount | 30.9k | none |
| `--strict-mcp-config` plus mount | 30.9k | `7 tools, 0 tokens (loaded on-demand)` |
| `ENABLE_TOOL_SEARCH=false`, strict, 3-note vault | 58.5k | `7 tools, 854 tokens` |
| `ENABLE_TOOL_SEARCH=false`, strict, 300-note vault | not recorded | `7 tools, 854 tokens` |

With tool search, which is Claude's default, the seven definitions are deferred, and the mount changes no reported total. A call pays for loading one schema plus the result. With tool search off, the definitions cost 854 tokens for either vault. `--strict-mcp-config` drops the user's own servers, so Mesa should not pass it.

## Codex CLI 0.157.1

Mount, with one `-c` override per key:

```
-c 'mcp_servers.mesa-vault.command="node"'
-c 'mcp_servers.mesa-vault.args=["<server>","--log","<log>","--marker","<word>","--vault","<vault>"]'
-c 'mcp_servers.mesa-vault.env_vars=["MESA_SESSION_ID","MESA_PROFILE"]'
-c 'mcp_servers.mesa-vault.default_tools_approval_mode="approve"'
```

The mount is exactly these four `-c mcp_servers.mesa-vault.*` overrides: `command`, `args`, `env_vars` and `default_tools_approval_mode`. The other flags in the argv below are not part of it. `-c mesa.embedded=true` is Mesa's existing launch flag (`CODEX_EMBEDDED` in `packages/core/src/agents/agents.ts`). `-c approval_policy=never -c sandbox_mode=workspace-write` are Mesa's existing headless flags. `-c model_reasoning_effort="low"` was used only in this spike, to save tokens.

`codex mcp list` and `codex mcp get` show it as `enabled`, `transport: stdio`, `default_tools_approval_mode: approve`. They also parse the same server as a single inline table, `-c 'mcp_servers.mesa-vault={command="node",args=[...],env_vars=["MESA_SESSION_ID","MESA_PROFILE"],default_tools_approval_mode="approve"}'`, though no model turn used that form.

Fresh argv, in window `codex1` (`lantern-shoal`, `MESA_SESSION_ID=spike0101`), with `env_vars` left out on purpose:

```
codex -c mesa.embedded=true -c model_reasoning_effort="low" -c 'mcp_servers.mesa-vault.command="node"' -c 'mcp_servers.mesa-vault.args=[...,"--marker","CODEX-FRESH-C1",...]' -c 'mcp_servers.mesa-vault.default_tools_approval_mode="approve"' -- 'Call the mesa-vault project_context tool and tell me the marker and session it returns. Use no other tools.'
```

| Path | Observation | Status |
| --- | --- | --- |
| Fresh, without `env_vars` | After the folder-trust answer, `Called mesa-vault.project_context` returned `marker=CODEX-FRESH-C1 session=unset profile=unset`. No approval prompt. | Verified call and pre-approval |
| Environment | Without `env_vars`, the server saw only `HOME LANG LOGNAME PATH SHELL TERM TMPDIR USER __CF_USER_TEXT_ENCODING`, with no `MESA_*` and no `TMUX`. With `env_vars`, it also saw `MESA_SESSION_ID` and `MESA_PROFILE` from the window. | Verified: `env_vars` is required |
| `/compact` | `Context compacted`. The same server process (pid 22893) answered the next call. | Verified: still mounted |
| `/clear` | Opened a new thread and started a second server process (pid 58472) under the same Codex process. That server answered the call. The old server kept running until `/exit`, which ended both and printed `codex resume 01a0edfe-161c-7db3-af12-e11dbb9c5743`. | Verified: still callable, new server process |
| Resume without the mount | `codex -c mesa.embedded=true -c model_reasoning_effort="low" resume 01a0edfe-... -C <folder>`: `/mcp` listed only other MCP servers the account and installation already provide, not `mesa-vault`, and no server process ran. | Verified: the mount is not persisted |
| Resume with the mount | The same argv plus the four overrides (marker `CODEX-RESUME-C2`) answered `marker=CODEX-RESUME-C2 session=spike0101`. Apart from a usage-limit notice, the only startup warnings were `` `mesa` is ignored `` and `Running without the shared background server: command-line configuration overrides ... requires embedded mode`. | Verified: the relaunch must repeat the overrides |
| Worktree | Window `codex2` in `lantern-shoal-wt` (`spike0102`), with `env_vars`: no trust prompt (`config.toml` held only the main checkout's trust entry), `marker=CODEX-WT-C3 session=spike0102`, and the server's cwd was the worktree. | Verified |
| Headless | `codex exec --json -C <folder> -c approval_policy=never -c sandbox_mode=workspace-write -c model_reasoning_effort="low" <four overrides> '<prompt>' < /dev/null` exited 0. It had an `mcp_tool_call` item with `status: completed` and the reply `marker=CODEX-EXEC-C4 session=spike0103`. Usage was 37,627 input tokens, 96 output. | Verified |
| Headless without `approve` | The same run without `default_tools_approval_mode` produced an `mcp_tool_call` item with `status: failed` and `MCP tool call requires approval, but approval policy is never`. No `tools/call` reached the server. | Verified: headless needs the pre-approval |

Standing context: two `codex exec --json` runs with the same argv and `'Reply with exactly READY.'` both used exactly 18,714 input tokens (12,160 cached) and 5 output tokens, one without the mount and one with it. `codex features list` shows `tool_search_always_defer_mcp_tools removed true`: MCP tool definitions are always deferred, so the mount's standing cost is 0 tokens. That baseline already had deferred MCP tools from other user MCP servers, so a Codex with no other MCP server was not measured. The run that called the tool used 37,627 input tokens over two model requests.

## Antigravity CLI 1.2.13

`agy --help` has no per-invocation MCP or settings flag. `agy mcp add` writes the global `~/.gemini/config/mcp_config.json`. The [MCP reference](https://antigravity.google/docs/mcp?tab=cli) also documents a workspace `.agents/mcp_config.json`. That was not exercised, because it means writing into the user's checkout. The [permissions reference](https://antigravity.google/docs/permissions?tab=cli) lists `mcp(server/tool)`, `mcp(server/*)` and `mcp(*)` rules under `permissions.allow` in the global `~/.gemini/antigravity-cli/settings.json`.

Temporary entry:

```
agy mcp add mesa-vault-spike -- node <server> --log <log> --marker AGY-FRESH-G1 --vault <vault-small>
```

The file went from 99 to 460 bytes. `agy mcp add` rewrote the whole file with sorted keys and added `"disabled": false` to the new entry, which has no `env`. It also created `~/.gemini/antigravity-cli/mcp/mesa-vault-spike/`, which caches one JSON schema per tool (7 files, 2,424 bytes, mode 0600).

| Path | Observation | Status |
| --- | --- | --- |
| Fresh | Window `agy1` (`lantern-shoal`, `spike0203`) ran `umask 077; agy --log-file <log> --prompt-interactive '<prompt>'`. After folder trust, each call stopped at `mesa-vault-spike/project_context / Allow calling this tool? 1. Yes, allow tool call / 2. Yes, and always allow tool '...' in this conversation / 3. Yes, and always allow tool '...' (Persist to settings.json) / 4.-6. No ...`. After `1`, the answer was `Marker: AGY-FRESH-G1, Session: spike0203`. | Verified call, prompt observed |
| Environment | With no `env` in the entry, the server saw the full window environment: `MESA_SESSION_ID`, `MESA_PROFILE`, `TMUX`, `TMUX_PANE`, `PWD`. | Verified: the global entry binds through the window |
| Outside Mesa | While the entry existed, an `agy` process started by a background usage poller (a temporary folder under `$TMPDIR`) also started the server, with no `MESA_*` and a launchd environment. It ran `server/discover`, `initialize` and `tools/list`, then exited in 1 s. | Verified: every `agy` on the machine starts the global entry |
| Pre-approval | No launch flag exists. Without a rule, the interactive prompt came back on every call, including after `/clear`, after resume and in the worktree. With the global rule `mcp(mesa-vault/*)`, see the allow-rule check below. | No per-launch pre-approval. The global rule was verified |
| Worktree | Window `agy2` in `lantern-shoal-wt` (`spike0204`): folder-trust prompt, then the tool prompt (`1`), then `marker=AGY-FRESH-G1 session=spike0204`. The server's cwd was the worktree. | Verified |
| `/clear` | `Clear conversation and start a new one` created conversation `2478ab4d-70c2-4e3a-97bd-e8344fc32ab4` (the first was `97c89858-7ba6-4f70-9270-1e84e7de3063`). The same server process (pid 74427) answered after the prompt, `session=spike0203`. | Verified: still mounted |
| `/compact` | Typing `/comp` offered only plugin skills. There is no compact command. | Unsupported by the provider |
| Resume | `agy --log-file <new log> --conversation 2478ab4d-...` with nothing repeated started a new server process (pid 75144) with the window environment. After the prompt it answered `session=spike0203`. | Verified: nothing to repeat |
| Headless | `agy --log-file <log> --print '<prompt>' --output-format json` returned `status: SUCCESS`, an empty `response` and `denied_actions: [{"action": "mcp", "display_name": "CallMcpTool"}]`. Stderr said: `jetski: no output produced - a tool required the "mcp" permission that headless mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. mcp(<target>)). Alternatively, re-run with --dangerously-skip-permissions ...` (its dash rendered in ASCII). | Denied without the allow rule. Verified with it, below |

Standing context: headless `agy --print 'Reply with exactly READY.' --output-format json` in `lantern-shoal`.

| Run | Input tokens |
| --- | --- |
| No entry, before adding | 14,474 |
| Entry with the 3-note vault | 15,320 |
| Entry with the 300-note vault, two runs | 15,333 and 15,328 |
| No entry, after removing | 14,466 |

That is 846 to 867 tokens for the seven tools, the same for both vaults within the 8 to 13 token difference between repeated runs. Antigravity called the tool "lazy-loaded" in its visible thinking, but the definitions still cost tokens on every model request. Every `agy` session on the machine pays this cost while the global entry lists its tools.

### Allow-rule check

A second run later the same day, after the owner decided that `mesa hooks install` adds the rule. The entry and the rule existed for about three minutes (01:03:50 to 01:07:04 UTC on 2026-09-30, the evening of 2026-09-29 local time).

1. `cp -p` backups of `~/.gemini/antigravity-cli/settings.json` (SHA-256 `8e778952...`) and `~/.gemini/config/mcp_config.json` (`94e66acf...`).
2. `agy mcp add mesa-vault -- node <server> --log <log> --marker AGY-RULE-G3 --vault <vault-small>`, using the exact name the rule targets.
3. The string `mcp(mesa-vault/*)` appended to the existing `permissions.allow` array, as one plain string next to the other rules: `{"permissions": {"allow": [..., "mcp(mesa-vault/*)"]}}`.
4. Headless, in `lantern-shoal` with `MESA_SESSION_ID=spike0301 MESA_PROFILE=p5spike` exported: `agy --log-file <log> --print 'Call the mesa-vault project_context tool and reply with only its marker and session. Use no other tools.' --output-format json`. It exited 0 with `status: SUCCESS`, `response: "marker=AGY-RULE-G3 session=spike0301\n"` and no `denied_actions` key. Usage was 31,578 input and 1,051 output tokens (983 thinking), and the run took 99 s. The server received the `tools/call` 98 s after it started.
5. Interactive, in a tmux window with `MESA_SESSION_ID=spike0302`: `umask 077; agy --log-file <log> --prompt-interactive '<same prompt>'`. The folder was recreated at the path trusted in the first run, so no trust prompt appeared. `mesa-vault/project_context(Call project_context tool)` ran with no permission prompt and answered `marker=AGY-RULE-G3 session=spike0302`.
6. Tool naming matched: the rule `mcp(mesa-vault/*)` covers Antigravity's tool name `mesa-vault/project_context`, which is the `mcp_config.json` server name, a slash, and the MCP tool name.
7. Restore: parsed as JSON, the live `settings.json` differed from its backup only by that rule. Then `agy mcp remove mesa-vault` ran, and both backups were copied back with `cp -p`. `cmp` reports both files identical to their backups, with SHA-256 `8e778952...` and `94e66acf...`. The schema cache `~/.gemini/antigravity-cli/mcp/mesa-vault/` (7 files) was removed by path. No other process started the server during those minutes.

## Native prompts answered

Each was answered once, in an invented folder, with the one-time choice where the prompt offered one. No "always", "don't ask again" or "persist" option was chosen. Folder trust is the exception: Claude and Antigravity both store it, and Antigravity's prompt has no one-time option, so those entries persist (see Cleanup). The allow-rule check answered no prompts.

1. Claude folder trust, `lantern-shoal`: `Yes, I trust this folder`. Claude recorded `hasTrustDialogAccepted: true` for that path in its own `~/.claude.json`. `allowedTools` stayed `[]`.
2. Claude tool prompt, manual mode without `--allowedTools`, worktree: `1. Yes`.
3. Codex folder trust, `lantern-shoal`: `1. Trust and continue`. It was written to the temporary `CODEX_HOME/config.toml`, which was deleted.
4. and 5. Antigravity folder trust, `lantern-shoal` and `lantern-shoal-wt`: `Yes, I trust this folder`, the only accepting option. Antigravity saved both paths in `trustedWorkspaces` in `~/.gemini/antigravity-cli/settings.json` (14 to 16 entries).
6. to 9. Antigravity tool prompts (fresh, after `/clear`, resume, worktree): `1. Yes, allow tool call`. `permissions.allow` still had its 8 rules and no `mcp(...)` rule afterwards.

## Recommendations

### Server (#300)

- Hand-roll the server in `packages/core`: newline-delimited JSON-RPC 2.0 over stdio, with no dependency. All three clients accepted it, so the SDK is not needed. Rules the clients rely on:
  - Return the requested `protocolVersion` when supported: Claude and Antigravity ask for `2025-11-25`, Codex for `2025-06-18`.
  - Answer every unknown request with `-32601`. Antigravity's `server/discover` (protocol `2026-07-28`) falls back to `initialize` only after that error.
  - Never reply to a notification.
  - Ignore unknown params such as Claude's `_meta`.
  - Keep stdout for JSON-RPC only.
  - Keep `ping`.
- Bind to the session from the process environment only: `MESA_SESSION_ID` and `MESA_PROFILE`. All three agents deliver them with the mounts below.
- When `MESA_SESSION_ID` is missing, or is not a live session of `MESA_PROFILE`, the server must list no tools and do nothing: an empty `tools/list`, an error from any `tools/call`, and no vault reads or writes. Antigravity starts the global entry in non-Mesa processes, and the allow rule would let them call it with no prompt. An empty list also spares those sessions the roughly 850 tokens.
- An explicit check for #300 and the final qualification (#302): Antigravity caches each server's tool schemas per server name in `~/.gemini/antigravity-cli/mcp/<name>/`, shared by every `agy` process. An outside process that gets the inert empty `tools/list` may rewrite that cache while a Mesa window running at the same time relies on the full list. This spike did not observe that race.
- Keep the definitions fixed and short. The standing cost is set by `tools/list` (2,439 bytes here) and does not depend on vault size. Vault content only enters through `tools/call` results.
- After Codex or Antigravity `/clear`, the server still sees the saved `MESA_SESSION_ID`, while the native conversation is one Mesa does not rebind (ADR-0010). The server cannot see the Codex or Antigravity conversation ID. Decide whether writes are allowed from a cleared conversation. Claude passes `CLAUDE_CODE_SESSION_ID` to the server if a native check is wanted.

### Launch (#301)

- **Claude Code:** add `--mcp-config=<json or file> --allowedTools=mcp__mesa-vault` to start, resume and fork, with `=` so neither variadic flag swallows the goal. Full argv examples are in the appendix. Pass no `env`, and do not pass `--strict-mcp-config`. A resume without them mounts nothing. Fork (`--resume <id> --fork-session`) is inferred from resume, not observed. `/clear` and `/compact` keep the server. For headless, add `--mcp-config=...` and put `mcp__mesa-vault` into the `--allowedTools` list the command already ends with.
- **Codex:** add the server to start, resume, fork and `exec`, as the four `-c` overrides used here (or the single inline table that `codex mcp get` parsed). It needs `env_vars=["MESA_SESSION_ID","MESA_PROFILE"]`, because Codex passes only a default list of variables (observed). Inferred, not observed: with `env_vars` the argv stays identical while a resume in a different window still gives the server that window's new Mesa ID. This spike resumed in the same window with the same ID. Fork is likewise inferred from resume. It needs `default_tools_approval_mode="approve"`, or `exec` fails the call under `approval_policy=never`. These overrides also keep the TUI embedded, like `CODEX_EMBEDDED`. Every resume must repeat them. `/clear` starts another server process in the same window.
- **Antigravity:** Mesa owns one named entry, `mesa-vault`, in `~/.gemini/config/mcp_config.json`, with `command` and `args` and no `env`, preserving other entries. It shares an owner with the named global `PreInvocation` hook entry (ADR-0010). The binding works through the window environment, so this is MCP access, not the "CLI access, no MCP" fallback. Fresh, worktree, resume and `/clear` need nothing repeated. Pre-approval is the global `permissions.allow` string `mcp(mesa-vault/*)` in `~/.gemini/antigravity-cli/settings.json`, which the owner decided `mesa hooks install` adds and uninstall removes. The allow-rule check verified it: a headless and an interactive turn both called `project_context` with no prompt or denial. Without it, every interactive call prompts (option 2 lasts one conversation, for one tool), and headless `mesa run` cannot call vault tools. Install and uninstall must touch only that one string and keep every other rule and setting. `agy mcp add` rewrites the whole file and `remove` adds a trailing newline, so Mesa should edit its own entry the way it edits the hooks file.

## Not verified

- Claude in `auto` mode without `--allowedTools`. Codex interactive without `approve`. Codex's single inline-table form in a model turn. Codex's literal `env` table. Antigravity's workspace `.agents/mcp_config.json` and `--dangerously-skip-permissions`.
- Fork for Claude and Codex, inferred from resume.
- A resume in a different window, with a new Mesa ID, reaching the server through Codex `env_vars` (inferred; the spike resumed in the same window).
- Queue and handoff launches. They use the same launch owner as start and resume.
- The Antigravity schema-cache race described under Server.
- The value of `CLAUDE_CODE_SESSION_ID` in the server's environment (only its name was logged).
- Claude's `--session-id` in headless: the result's `session_id` was not compared with the one passed.

## Cleanup

- `tmux -L p5spike kill-server`, after both runs. `/private/tmp/tmux-501/p5spike` was removed, and `tmux -L p5spike list-sessions` reports `No such file or directory`.
- The temporary `CODEX_HOME`, with its copied `auth.json`, rollouts and trust entry, was removed by explicit path.
- Antigravity: `agy mcp remove mesa-vault-spike` left the original content plus a trailing newline (100 bytes). The pre-test copy was restored with `cp -p`. `cmp` against the backup reports identical, and the SHA-256 is `94e66acf...` again. The schema cache `~/.gemini/antigravity-cli/mcp/mesa-vault-spike/` was removed by path, and the cache folder list matches its pre-test list. A final headless run started no server. The allow-rule check restored both of its files the same way (see that section).
- `~/.claude/settings.json` kept its pre-test SHA-256. `~/.codex/config.toml`, `~/.mesa/*`, the owner's vault and the default tmux server were not used.
- Trust entries persist. Antigravity's folder-trust prompt has no one-time option, and answering it saved both invented paths (`/private/tmp/claude-501/p5spike/lantern-shoal` and `-wt`) in `trustedWorkspaces` in `~/.gemini/antigravity-cli/settings.json`. Claude's trust answer saved a project entry for `lantern-shoal` in `~/.claude.json`. On 2026-09-29 the owner accepted these entries until the final qualification run (#302), after which Mesa's test entries are removed with a backup diff. Apart from the temporary allow rule, which was restored byte for byte, this spike made no other edits to global settings. For the "no persistent provider setting is touched" criterion, this part is met by that owner decision, not by removal.
- Also left in place: the spike conversations in `~/.claude/projects/` and `~/.gemini/antigravity-cli/conversations/`, which hold invented content only. The scratch folder was deleted after each run.

## Appendix: the throwaway server's `tools/list` result

This is the exact `result` the server returned to every client (2,484 bytes as the JSON-RPC line), with one tool per line:

```json
{"tools": [
  {"name": "project_context", "description": "The session's project overview and vault index. Call first.", "inputSchema": {"type": "object", "properties": {}, "required": [], "additionalProperties": false}},
  {"name": "read_note", "description": "Read one vault note by its vault-relative path.", "inputSchema": {"type": "object", "properties": {"path": {"type": "string", "description": "Vault-relative note path, e.g. projects/lantern-shoal/hub.md"}}, "required": ["path"], "additionalProperties": false}},
  {"name": "search_vault", "description": "Search the profile's vault text; returns matching note paths and lines.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string", "description": "Text to search for"}, "project": {"type": "string", "description": "Limit to one project slug"}, "limit": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Most results to return"}}, "required": ["query"], "additionalProperties": false}},
  {"name": "session_goals", "description": "Earlier sessions' goals and summaries for this project.", "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 20, "description": "Most sessions to return"}}, "required": [], "additionalProperties": false}},
  {"name": "save_decision", "description": "Record a meaningful decision with its rationale in the vault.", "inputSchema": {"type": "object", "properties": {"title": {"type": "string", "description": "Short decision title"}, "decision": {"type": "string", "description": "What was decided"}, "rationale": {"type": "string", "description": "Why"}, "probability": {"type": "number", "minimum": 0, "maximum": 1, "description": "Faro probability, if any"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "Faro confidence, if any"}}, "required": ["title", "decision", "rationale"], "additionalProperties": false}},
  {"name": "save_summary", "description": "Save this session's summary note (session-summary skill format).", "inputSchema": {"type": "object", "properties": {"summary": {"type": "string", "description": "Markdown summary of the session"}}, "required": ["summary"], "additionalProperties": false}},
  {"name": "save_note", "description": "Add a note under the vault system.", "inputSchema": {"type": "object", "properties": {"title": {"type": "string", "description": "Note title"}, "body": {"type": "string", "description": "Markdown body"}, "folder": {"type": "string", "enum": ["raw", "wiki", "projects", "daily"], "description": "Vault folder"}}, "required": ["title", "body"], "additionalProperties": false}}
]}
```

## Appendix: Claude argv with the mount

These follow the existing shapes in `packages/core/src/agents/agents.ts`. `<cfg>` is a config file path or one shell word of inline JSON, for example `'{"mcpServers":{"mesa-vault":{"command":"<server command>","args":[...]}}}'`. The spike ran start, resume and headless in this form, with `node <server>` as the command. Plan mode and fork were not run.

Start (`AGENTS.claude.start`, with the mount placed before the goal):

```
claude --session-id <uuid> [--permission-mode plan] --mcp-config=<cfg> --allowedTools=mcp__mesa-vault '<goal>'
```

Resume (`AGENTS.claude.resume`). The mount must be repeated:

```
claude --resume <uuid> [--permission-mode plan] --mcp-config=<cfg> --allowedTools=mcp__mesa-vault
```

Headless (`AGENTS.claude.headless.command`: the prompt, the session ID, JSON output, the profile's permission mode, and `--allowedTools` last, now always present because it holds `mcp__mesa-vault` followed by the profile's own tools):

```
claude -p '<prompt>' --session-id <uuid> --output-format json --permission-mode <mode> --mcp-config=<cfg> --allowedTools mcp__mesa-vault '<profile tool>' ...
```

The observed headless run was `claude -p '<prompt>' --session-id <uuid> --output-format json --permission-mode default --mcp-config=<file> --allowedTools mcp__mesa-vault`.
