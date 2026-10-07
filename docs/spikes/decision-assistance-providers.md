# Decision assistance across coding providers (#463)

Date: 2026-10-06 (22:18 to 23:20 Pacific). Mac: MacBook Pro (MacBookPro18,3, Apple M1 Pro), macOS 26.6.2 (25G83), Node v24.16.0, tmux 3.7c. Claude Code: 2.1.292. Codex CLI: 0.160.0 (model GPT-6.1-Sol, its default). Antigravity CLI: 1.3.1 (Gemini 3.8 Flash, high). Mesa: branch `sessions/decision-delivery`, built at `fbd93e8e`; the Codex cells from `h3x6w64d` on ran `3f2d6542`, and the results stand at `064b2a25` (both fixes below). Decision model: `clef` on profile `p11-live` for the whole matrix, plus one `jev` cell (Claude headless, margin 0.98, `jev-1.13.0`).

## What is being proven

ADR-0019 "Delivery into sessions" and the #459 native delivery probe (`docs/spikes/decision-assistance-feasibility.md`) fix what may be delivered and where:

| Path | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| Decision tool (`decision_evaluate`) | `mesa-decisions` in the per-launch `--mcp-config`, pre-approved with `--allowedTools=mcp__mesa-vault,mcp__mesa-decisions` | `mesa-decisions` as four `-c mcp_servers.mesa-decisions.*` overrides, `default_tools_approval_mode="approve"` | One global entry `mesa-decisions` in `~/.gemini/config/mcp_config.json` and the rule `mcp(mesa-decisions/*)` in `~/.gemini/antigravity-cli/settings.json`, written by `mesa hooks install` only while the profile has a Decision model (an install without one removes Mesa's entry) |
| Capability pointer | The SessionStart pointer ends with one `Decisions:` line (under 200 bytes) while the tool is configured | Same, at the first prompt (Codex runs SessionStart then) | Same, in the PreInvocation ephemeral message |
| Automatic advice | `UserPromptSubmit` `additionalContext` for the prompt (ready answer, else one live ask with what is left of the 1,500 ms) | `UserPromptSubmit` `additionalContext` (a developer message) | `PreInvocation` `injectSteps`: the saved goal's ready answer only, re-sent unchanged on every model call; its hook carries no prompt and never asks a model |
| Background ask at launch | The window runs `mesa decisions prepare` in a subshell before the agent, so the goal's first turn reads a ready answer | Same | Same (the only source of its advice) |

A turn's hook spends at most the per-turn deadline, 1,500 ms in all (`PER_TURN_MS`, ADR-0019's frozen gate): the vault read, the ready answer and any live ask together, the ask getting only what is left, well under the native 5 s timeout. A miss, abstention, failure or late answer sends nothing. With no key nothing of `mesa-decisions` is mounted for any provider: Claude Code and Codex launch without it, and `mesa hooks install` writes no Antigravity entry (and removes Mesa's own).

Fixture coverage already in the branch (not a substitute for this run): `packages/core/src/agents/{claude,codex,antigravity}/decision-assistance.test.ts`, `packages/core/src/sessions/native/instructions.test.ts`, `packages/cli/src/commands/hooks.test.ts`, `packages/cli/src/commands/decisions/mcp.test.ts`, `apps/desktop/src/app/App.sessions.test.tsx`.

## Setup (once)

All content is invented. Nothing runs in the default or work profile, and no real vault note is used.

```sh
export MESA="node $HOME/Developer/personal/mesa-463/packages/cli/dist/mesa.js"   # the branch's build
export P='--profile p11-live'                                                     # socket mesa-p11-live
export SCRATCH=/private/tmp/claude-501/p11-463-live && mkdir -p "$SCRATCH"
$MESA $P decisions key list --json            # typesafe and cloudflare set
$MESA $P decisions use clef --json            # model clef
# An invented project with an invented convention, and one vault note holding the marker.
mkdir -p "$SCRATCH/basalt-harbor" && git -C "$SCRATCH/basalt-harbor" init -q
printf '# basalt-harbor\nA tiny invented feed importer.\n' > "$SCRATCH/basalt-harbor/README.md"
git -C "$SCRATCH/basalt-harbor" add -A && git -C "$SCRATCH/basalt-harbor" commit -qm init
$MESA $P register "$SCRATCH/basalt-harbor" --create --json
VAULT=$($MESA $P config --json | jq -r '.data.vault')
mkdir -p "$VAULT/wiki/decisions"
cat > "$VAULT/wiki/decisions/feed-retry.md" <<'EOF'
---
project: basalt-harbor
type: decision
---
# Feed retry policy

Feed calls retry exactly 7 times on HTTP 503, with jittered backoff (QUARTZ HERON 41).
EOF
```

Prompts used in every cell (the marker `QUARTZ HERON 41` exists only in that note):

- Goal (advice cell): `Fix the feed import retry. Without calling any tool or reading any file, state the retry count this project's convention uses and quote any marker in parentheses you were given.`
- Tool cell: `Call the decision_evaluate tool with {"site":"relevance","query":"feed retry policy"} and report its advice text and first source id verbatim. Call no other tool.`
- Later turn (resume, clear, compact cells): `Without calling any tool, how many times do feed calls retry on 503 here, and what marker came with that?`

Codex runs with a temporary `CODEX_HOME` (its login copied in), never `~/.codex`:

```sh
export CODEX_HOME="$SCRATCH/codex-home" && mkdir -p "$CODEX_HOME" && cp ~/.codex/auth.json "$CODEX_HOME/"
```

## Global files: back up, compare, restore

Before `mesa hooks install`, and again after `mesa hooks uninstall` at the end:

```sh
FILES="$HOME/.claude/settings.json $CODEX_HOME/hooks.json $CODEX_HOME/config.toml $HOME/.gemini/config/hooks.json $HOME/.gemini/config/mcp_config.json $HOME/.gemini/antigravity-cli/settings.json"
mkdir -p "$SCRATCH/backup"
for f in $FILES; do [ -f "$f" ] && cp -p "$f" "$SCRATCH/backup/$(echo "$f" | tr / _)"; done
for f in $FILES; do [ -f "$f" ] && shasum -a 256 "$f" || echo "absent $f"; done | tee "$SCRATCH/sha-before.txt"
$MESA $P hooks install --json | jq '.data | {changed, warning, antigravityVault: .antigravityVault.installed, antigravityDecisions: .antigravityDecisions.installed, decisionsWanted: .antigravityDecisions.wanted}'
$MESA $P hooks status
# ... the matrix ...
$MESA $P hooks uninstall --json | jq '.data.changed'
for f in $FILES; do [ -f "$f" ] && shasum -a 256 "$f" || echo "absent $f"; done | tee "$SCRATCH/sha-after.txt"
diff "$SCRATCH/sha-before.txt" "$SCRATCH/sha-after.txt" && echo 'byte for byte'
```

Expected: install adds only Mesa's entries (`jq` the files: every pre-existing key and server unchanged; `mesa-vault` and `mesa-decisions` beside the user's); `diff` prints nothing after uninstall. `$CODEX_HOME/config.toml` gains Codex's own trust entries when hooks are reviewed (Codex writes them, Mesa never does): compare it with that in mind, or restore it from the backup. A foreign entry check: put `{"mcpServers":{"mesa-decisions":{"command":"node","args":["/opt/invented.js"]}}}` in a copy of the Antigravity MCP file under a throwaway `HOME` (never the real one) and confirm `hooks install` reports the conflict and leaves both files unchanged.

## Lifecycle commands per cell

`ID` is the Mesa session id from `--json`; `$MESA $P show $ID --json | jq '.data.decisions'` after each cell records configured against observed (`tool.observedAt` after a real call, `advice.observedAt` after a hook sent advice).

| Cell | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| Fresh | `$MESA $P open basalt-harbor --goal "<goal>" --json` | `... --agent codex ...` (accept folder trust, then "Review hooks" for Mesa's entries) | `... --agent antigravity ...` (accept folder trust) |
| Tool call | `$MESA $P send $ID "<tool prompt>"` | same | same |
| Resumed | `$MESA $P stop $ID` then `$MESA $P resume $ID --json`, then `send` the later-turn prompt | same | same (the hook cannot tell a resume; goal advice comes again) |
| Worktree | `$MESA $P open basalt-harbor --branch p11-live-wt --goal "<goal>" --json` | `--agent codex` | `--agent antigravity` |
| Handoff | `$MESA $P handoff $ID --note "$SCRATCH/note.md" --json` (an invented note), then read the successor | `--agent codex` | `--agent antigravity` |
| Queued | `$MESA $P open basalt-harbor --after $ID --goal "<goal>" --json`, then `$MESA $P stop $ID` | `--agent codex` | `--agent antigravity` |
| Headless | `$MESA $P run <an invented skill> --project basalt-harbor --json` (UserPromptSubmit fires in `claude -p`) | `--agent codex` (`codex exec --json`) | `--agent antigravity` (`agy -p`) |
| Background | `$MESA $P open basalt-harbor --background --goal "<goal>" --json` | unsupported (Claude only) | unsupported (Claude only) |
| Clear | `$MESA $P send $ID "/clear"`, then the later-turn prompt | same (0.160.0 has `/clear`) | same (1.3.1 lists `/clear`) |
| Compact | `$MESA $P send $ID "/compact"`, then the later-turn prompt | `$MESA $P send $ID "/compact"` | unsupported (1.3.1 lists no `/compact`, ADR-0012) |
| No key | `$MESA $P decisions use none`, open fresh: no `mesa-decisions` in the launch, no `Decisions:` line, no advice; `decisions use clef` after | same | `$MESA $P decisions use none && $MESA $P hooks install`: no `mesa-decisions` entry or rule in the two Antigravity files, `show` says disabled; then `decisions use clef`: `show` says missing with action `hooks install` until `$MESA $P hooks install` |
| Off | `$MESA $P decisions off --session $ID`, send the later-turn prompt: no advice, the tool lists nothing; `decisions on` after | same | same |
| Outside Mesa | run `claude`, `codex`, `agy` in `$SCRATCH/basalt-harbor` from a plain terminal: no hook output, `mesa-decisions` lists no tools | same | same |

## How to confirm a real call and advice consumption

- **Claude Code.** Transcript: `~/.claude/projects/<cwd with / as ->/<agentSessionId>.jsonl` (`agentSessionId` from `show`). A real call: `grep -c '"name":"mcp__mesa-decisions__decision_evaluate"' <transcript>`. Advice delivered: the `UserPromptSubmit` hook's `additionalContext` holding `QUARTZ HERON 41` (`grep -c 'QUARTZ HERON 41' <transcript>` above zero before the assistant reply). Consumed: the reply states 7 and quotes the marker with no tool use in that turn.
- **Codex.** Rollout: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*<agentSessionId>.jsonl`. A real call: an MCP tool call event naming server `mesa-decisions` and tool `decision_evaluate` (`grep -c 'decision_evaluate' <rollout>`). Advice delivered: a `developer` message holding the marker. Consumed: the reply quotes it with no tool call in that turn. Also check no empty developer message appears on turns with no advice (Mesa prints a bare newline then).
- **Antigravity.** The hook's `transcriptPath` (Mesa does not log it; read the newest file under the conversation's `artifactDirectoryPath`, or rerun the cell headless with `agy -p ... --output-format stream-json`). A real call: a tool step named `mesa-decisions/decision_evaluate`. Advice: the ephemeral message holding the pointer and the marker on every invocation of the turn. Consumed: the final answer quotes it.
- **Mesa side.** `$MESA $P decisions status --session $ID --json | jq '.data.use'` lists each evaluation (automatic for hooks and the background ask, on-demand for tool calls); `$MESA $P show $ID --json | jq '.data.decisions'` gives `observedAt` for both channels.

Record each cell as the transcript facts above, sanitized: no prompts beyond the invented ones, paths under the home shown as `~`, no keys.

## Results

Configured = Mesa's config and `show` say so; Called = a real `decision_evaluate` call in the transcript; Delivered = the marker in the provider's transcript; Consumed = the reply quotes it with no tool use.

| Cell | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| Fresh: tool called | pass | pass | pass |
| Fresh: advice consumed | pass | pass (after the person trusted Mesa's hooks; see C1) | pass |
| Resumed: tool called | pass | pass | pass |
| Resumed: advice consumed | pass | pass (clean: nothing about the marker before the resume) | pass (the conversation had seen the marker before the resume) |
| Worktree | pass | pass | pass |
| Handoff | pass | pass | pass |
| Queued | pass | pass | pass |
| Headless | pass (also with `jev`) | pass | unsupported: a skill run's window asks nothing in the background, and PreInvocation only reads a ready answer (`show` now says so, fix 2) |
| Background | pass | unsupported: `--background` is Claude only | unsupported: `--background` is Claude only |
| Clear | pass (Mesa follows Claude's explicit `source: clear`) | unsupported: `/clear` starts a new thread, which Mesa records as `SessionIdentityChanged` and does not follow (identity rule); nothing is sent, `show` says conflicting | unsupported: `/clear` starts a new conversation, which Mesa does not follow; nothing is sent, `show` says conflicting |
| Compact | pass | pass | unsupported: 1.3.1 has no `/compact` |
| No key: nothing mounted or sent | pass | pass | pass |
| Off: no advice, no tool | pass (a server started before `off` still lists the tool; a call returns the inert error) | pass (started after `off`: no tool listed) | pass (global server lists it; a call returns the inert error) |
| Outside Mesa: inert | pass | pass | pass |
| Global files byte for byte after the run | pass (restored from `cp -p` backups, SHA-256 equal) | pass (`~/.codex` never written) | pass (restored, SHA-256 equal) |
| Added turn latency (hook wall time, p50 / p95 over 26 timed turns; the deadline is 1,500 ms) | 739 / 1,047 ms (transcripts: 479 / 1,138 ms over 11 real turns) | 757 / 1,149 ms | 388 / 402 ms over 10 invocations |

A turn with no advice (`What is 2+2?`, relevance answer `none`, margin 0.66) adds nothing: the hook prints a bare newline, and neither Claude Code (no `hook_additional_context` attachment) nor Codex (no developer message) records any context for it.

Known limits confirmed: Antigravity's advice is the saved goal's only, so a goal-less session gets none (`show`: unsupported, "Antigravity hooks carry no prompt; it needs a saved goal"); Codex delivers nothing until the person reviews Mesa's hooks (C1). Untested: a session started before the key gaining the tool after a restart (the `missing` status with action was seen only for Antigravity's global entry, A9); whether an Antigravity process already running picks up an entry `hooks install` adds later (`show` says configured at once); the foreign `mesa-decisions` entry conflict on a real Antigravity file (fixture-tested only, `agents/antigravity/decision-assistance.test.ts`).

## Evidence per cell

Paths under the home are `~`; `<scratch>` is the run's scratch folder (deleted). Transcripts: Claude `~/.claude/projects/<cwd>/<id>.jsonl`; Codex `<scratch>/codex-home/sessions/2026/10/06/rollout-*-<thread>.jsonl`; Antigravity `~/.gemini/antigravity-cli/brain/<conversation>/.system_generated/logs/transcript.jsonl`. "Advice" below is always the same packet: `Mesa decision advice for this prompt (automatic; advice only, it never acts): Most relevant: note:wiki/decisions/feed-retry.md (margin 0.9x, clef). Read it before relying on it.` then `note:wiki/decisions/feed-retry.md "Feed retry policy": Feed calls retry exactly 7 times on HTTP 503, with jittered backoff (QUARTZ HERON 41).`

### Claude Code

- C-fresh (Mesa `8jxp5rj2`, native `d6b8f6b2`). Folder trust accepted (Down, Enter). SessionStart pointer ends with the `Decisions:` line. The goal turn: a `hook_additional_context` attachment from `UserPromptSubmit` holding the advice (margin 0.94); the reply "7 retries ... (QUARTZ HERON 41)", citing "Mesa's automatic decision advice", no `tool_use`. `decisions status` use: the launch's `prepare` (automatic, 567 ms), then the goal turn read it ready (`cached`, 0 ms).
- C-tool. `tool_use` `mcp__mesa-decisions__decision_evaluate` `{"site":"relevance","query":"feed retry policy"}` (after one ToolSearch to load it); result advice "Most relevant: note:wiki/decisions/feed-retry.md (margin 0.97, clef)", first source `note:wiki/decisions/feed-retry.md`. Use: on-demand, accepted, 386 ms. `show`: `tool.observedAt` 05:20:45Z, `advice.observedAt` 05:20:40Z.
- C-resumed (`stop`, `resume` gave Mesa `m2x39epm`, same native `d6b8f6b2`). SessionStart (resume) pointer; the later-turn prompt got the advice (live ask, 568 ms); reply "7 times ... (QUARTZ HERON 41)", no tool use. Resumed tool call: `mcp__mesa-decisions__decision_evaluate` again, `tool.observedAt` 05:22:27Z.
- C-clear. `/clear` moved the record to native `9b97d5e8` (Mesa follows Claude's `source: clear`); the new conversation's SessionStart re-sent the pointer; the later-turn prompt got the advice; reply "7 times ... QUARTZ HERON 41 ... from the Mesa decision advice attached to your prompt", 0 `tool_use` in the whole new transcript (a clean consumption: the cleared context held no marker).
- C-compact. `/compact` wrote a `compact_boundary` (05:23:50Z) and SessionStart (compact) re-sent the pointer; the later-turn prompt got the advice (05:24:27Z); reply 7 and the marker.
- C-off (`decisions off --session m2x39epm`, then `/clear`, native `97e25b48`). SessionStart pointer without the `Decisions:` line; the later-turn prompt got no attachment and the reply did not know the count; the tool prompt: the server, started before `off`, still listed the tool, and the call returned `is_error` "mesa-decisions is inert: decision assistance is off for session m2x39epm". `show`: both disabled, "Turned off for this session". Then `decisions on`.
- C-worktree (`hbk4ba46`, cwd `~/.mesa/p11-live/worktrees/basalt-harbor/p11-live-wt`). Advice attachment; reply 7 and the marker; 0 `tool_use`.
- C-handoff (`hbk4ba46` to `j6tvmfb3`, an invented note). The successor's first prompt got the advice (margin 0.90); it read the handoff note, then the cited note through `mcp__mesa-vault__read_note`, and answered 7 and the marker.
- C-queued (`q5gbxfzv`, `--after j6tvmfb3`, started when that one stopped). Advice attachment; 0 `tool_use`; reply 7 and the marker.
- C-headless (`mesa run feed-check -- "feed retry policy"`, Mesa `ed9d4wm7`, kind run, 9.6 s). Advice attachment in `claude -p`; 0 `tool_use`; output "retry feed calls exactly 7 times on HTTP 503 ... marked (QUARTZ HERON 41)". The same with `decisions use jev` (`4mvc8xev`): advice "margin 0.98, jev-1.13.0", output quotes the marker; `use clef` after.
- C-background (`open --background`, `fzkzmff5`). Advice attachment; 0 `tool_use`; reply 7 and the marker.
- C-no-key (`decisions use none`, `842ycsdv`). Launch: `--mcp-config` holds only `mesa-vault`, `--allowedTools=mcp__mesa-vault`, no `decisions prepare`; no `Decisions:` line; no `UserPromptSubmit` attachment; reply did not know. `show`: disabled, "no decision model: add a key with mesa decisions key set". `use clef` after.
- C-outside. `claude -p` in the project with no `MESA_SESSION_ID`: only the person's own SessionStart hooks; no Mesa pointer, no advice, no `mesa-decisions` (mounted per launch only). `mesa decisions mcp` with no `MESA_SESSION_ID`: `tools/list` returns `[]`, stderr "listing no tools: not in a Mesa session".

### Codex

- C1 (first start, `agg6prv2`). Folder trust, then "Hooks need review: 9 hooks are new or changed": each was Mesa's, from `<scratch>/codex-home/hooks.json`, trusted with `t`. The goal turn had already run before the review: no advice (the known limit). From then on `hooks status` shows all nine TRUSTED.
- Fix 1 found here (`sn8f3gnm`): advice delivered and consumed, but `mesa send` refused "session sn8f3gnm runs bash, not its agent": behind the background ask the window ran `sh -c '(... decisions prepare &); codex ...'`, so sh stayed the pane process. After the fix the pane runs `codex` (`#{pane_current_command}`), and every cell below sent normally.
- X-fresh (`h3x6w64d`, thread `01a114dd`). Developer messages: the pointer with the `Decisions:` line, then after the user prompt the advice (margin 0.94); reply "exactly 7 retries on HTTP 503 ... (QUARTZ HERON 41)"; no tool call. No-advice turn (`What is 2+2?`): no developer message at all.
- X-tool. Codex 0.160 calls MCP tools from its `exec` code tool; the rollout's `item_completed` holds `McpToolCall` server `mesa-decisions`, tool `decision_evaluate`, args `{"site":"relevance","query":"feed retry policy"}`, status completed; reply quotes the advice and first source id. `tool.observedAt` 05:37:48Z.
- X-resumed, clean (`mwswgpk2`, only a `2+2` turn, no advice; `stop`, `resume` as `xdr99eg9`, same thread `01a114df`). SessionStart pointer, then the later-turn prompt and the advice developer message; reply "7 times. Marker: QUARTZ HERON 41."; no tool call. Resumed tool call: `McpToolCall` `mesa-decisions`/`decision_evaluate` completed.
- X-clear. `/clear` started thread `01a114e1` with SessionStart `source: clear`; Mesa logged `SessionIdentityChanged` and kept the record on `01a114df`; the new thread got no pointer and no advice, and the reply did not know. `show` advice: conflicting, "Another native conversation took over; reopen through Mesa".
- X-compact (resumed again as `h830acay`, thread `01a114df`). `compacted` at 05:42:48Z; SessionStart (resume, compact) re-sent the pointer. The first later turn's live ask was cancelled at 1,447 ms (`status: unavailable, reason: cancelled`): nothing was sent and the turn went on (its answer came from the compacted summary). The next turn: advice developer message (live ask 417 ms), reply "7 retries. Marker: QUARTZ HERON 41."
- X-worktree (`dtd03q5b`, `~/.mesa/p11-live/worktrees/basalt-harbor/p11-live-wt-codex`). Pointer, advice, reply 7 and the marker, no tool call.
- X-handoff (`dtd03q5b` to `zc2v97b3`). Advice after the successor's first prompt; reply 7 and the marker; no tool call.
- X-queued (`9kvbezea`, `--after zc2v97b3`). Advice; reply 7 and the marker; no tool call.
- X-headless (`mesa run feed-check --agent codex`, `fw2619mm`, `codex exec`, 9.7 s). User `$feed-check feed retry policy`, then the advice developer message, then the skill; output "retries exactly 7 times on HTTP 503 ... (QUARTZ HERON 41)"; no tool call.
- X-off (`aqkeyzj2`, off before its first prompt). No advice developer message, no `Decisions:` line; the tool prompt: `exec` found no `decision_evaluate` (the server started while off and listed none), reply "the decision_evaluate tool is unavailable". `show`: both disabled.
- X-no-key (`gpggddy3`). Launch has no `mcp_servers.mesa-decisions.*` overrides and no `decisions prepare`; no `Decisions:` line, no advice; reply did not know. `show`: disabled.
- X-outside. `codex exec` in the project with the same `CODEX_HOME` (Mesa's trusted hooks in it) and no `MESA_SESSION_ID`: no Mesa developer message, no `mesa-decisions`; reply did not know.

### Antigravity

- A-fresh (`2cfrzfek`, conversation `9f7969a1`). Folder trust accepted (Enter). Step 1 `EPHEMERAL_MESSAGE` (source `SYSTEM_SDK`): the pointer with the `Decisions:` line, then the advice; step 2 `PLANNER_RESPONSE` "a retry count of 7 ... Marker: (QUARTZ HERON 41)", no tool call.
- A-tool. `PLANNER_RESPONSE` `tool_calls` `call_mcp_tool` with `ServerName "mesa-decisions"`, `ToolName "decision_evaluate"`, arguments `{"query":"feed retry policy","site":"relevance"}`; a `GENERIC` step with the result; the answer quotes the advice and first source id. `tool.observedAt` 05:50:18Z. The ephemeral message (pointer and goal advice) came again before each model call of the turn.
- A-resumed (`resume` as `x7ny3825`, `--conversation 9f7969a1`). The later turn's ephemeral message held the marker; reply "retry 7 times ... (QUARTZ HERON 41)". Resumed tool call: `call_mcp_tool` `mesa-decisions`/`decision_evaluate` completed.
- A-worktree (`gh15f9p7`, `~/.mesa/p11-live/worktrees/basalt-harbor/p11-live-wt-agy`, trust accepted). Ephemeral with pointer and advice; reply 7 and the marker; no tool call.
- A-handoff (`gh15f9p7` to `6zqyke3q`). Ephemeral with the advice; reply "Exactly 7 retries ... (QUARTZ HERON 41)".
- A-queued (`12re0e4c`, `--after 6zqyke3q`). Ephemeral with the advice; reply 7 and the marker.
- A-headless (`mesa run feed-check --agent antigravity`, `f8kredf6`, `agy --print`, 2 min wall). The ephemeral message held the pointer only (no ready answer: `goalPreparing` skips runs), and the model answered "3 retries ... (feed-check)", invented. `show` said configured: fix 2 makes it "unsupported: Antigravity's advice is the goal's answer asked as its window starts; a skill run asks none".
- A-clear (`6bbq6drj`). 1.3.1 lists `/clear`; it started conversation `107d7a15`, which had no ephemeral message at all and did not know the count. `show` advice: conflicting, "Another native conversation took over; reopen through Mesa".
- A-compact. The slash list of 1.3.1 has no `/compact` (only fuzzy matches).
- A-off (`dm5kzrv1`, off after its first turn). Later turns' ephemeral messages: the pointer without the `Decisions:` line, no advice; reply did not know. Tool call: `Encountered error in step execution: mesa-decisions is inert: decision assistance is off for session dm5kzrv1`.
- A9, no key. `decisions use none && hooks install`: `~/.gemini/config/mcp_config.json` servers `mesa-vault` and the person's own one, rules only `mcp(mesa-vault/*)`. Session `cctfnqea`: pointer without `Decisions:`, no advice; `show` disabled. `decisions use clef`: `show` tool missing, "No global mesa-decisions entry; run mesa hooks install", action `hooks install`; after `hooks install`: configured.
- A-outside. `agy --print` in the project with no `MESA_SESSION_ID`: no ephemeral message; the model said it did not have `decision_evaluate` (the global server lists no tools outside a session).
- Goal-less (`c6g58nd8`): `show` advice unsupported, "Antigravity hooks carry no prompt; it needs a saved goal".
- Observed once: the goal `Say only: ready.` got a relevance answer pointing at the feed note (accepted, margin 0.70, CLEF), so its advice was sent though it does not bear on that goal. With only one decision note in the project the model had little to choose from; noted, not a delivery fault.

## Turn latency

The hook as the provider runs it: `sh -c '<installed command>'` with a real hook payload on stdin, for live sessions of each provider (`p11-live`, CLEF), timed from spawn to exit. Kinds: live (a new feed prompt, one live ask), ready (the same prompt again), none (an unrelated prompt: a live ask that answers `none`), off (the session turned off).

| Provider | live (8) | ready (5 or 10) | none (8) | off (5) | all |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 928 / 1,203 ms | 396 / 404 ms | 838 / 1,033 ms | 337 / 342 ms | 739 / 1,047 ms (max 1,298) |
| Codex | 820 / 997 ms | 401 / 415 ms | 832 / 1,210 ms | 344 / 345 ms | 757 / 1,149 ms (max 1,229) |
| Antigravity | n/a (no live ask) | 388 / 402 ms | n/a | n/a | 388 / 402 ms (max 409) |

p50 / p95 in each cell. From Claude Code's own transcripts (prompt timestamp to the `UserPromptSubmit` attachment, 11 real turns with advice): p50 479 ms, p95 1,138 ms, max 1,264 ms. All within the 1,500 ms p95 gate. The off column is the fixed cost of starting node and Mesa, which Mesa's earlier `UserPromptSubmit` hook already paid on every turn of a Mesa session; what decision assistance adds on top is about 55 ms for a ready answer and 400 to 900 ms for a live ask. The one deadline miss seen (X-compact) cancelled the ask at 1,447 ms and sent nothing, as designed; because `PER_TURN_MS` starts once node runs, that turn's hook wall time was about 1.8 s (node start plus the full budget), still far under the native 5 s timeout.

## Global files

Before `mesa hooks install` each file was copied with `cp -p` and hashed; after the run each was restored from its copy (not `mesa hooks uninstall`, which would also strip the person's older Mesa entries) and hashed again. Codex ran only with a temporary `CODEX_HOME` holding a copy of its login; `~/.codex` was never written.

While installed (after the last `hooks install`, SHA-256):

```
caeb448662cb3b0b41cde4b92de32ca43a3a3045498fbde8b8d9cfdaece2f1a4  ~/.claude/settings.json
e69c020d9fe7175e69ff8c6b49990936fd3ef2a2c8118ff98b8b4f1917623358  ~/.gemini/config/hooks.json
12b103eda5a5afb42550f46552e4c856f5fc873db432f7d73f3c3c9cdf9f21ce  ~/.gemini/config/mcp_config.json
b00dad587efb45c5fe52d52c00a80c6b628771d9d5de8653ed600dff5c515c07  ~/.gemini/antigravity-cli/settings.json
599b6f8dcfb30cf069198294129231df68202c1390bd9ad3eb4bd652bd00e51b  ~/.codex/hooks.json
3edb73778aecb295326dc0b29940500236ed421761226bfb4dd6e1a8bd6bdcd3  ~/.codex/config.toml
```

Full before and after SHA-256 (equal, `diff` empty):

```
553d0d42d3f91843299777f498db55acb6a0c1894c1ff0c902961371847516e0  ~/.claude/settings.json
4106c89cb4905ae564ce04cec5248aa6dd7d47b2b2d662906962efb70478ac8c  ~/.gemini/config/hooks.json
9ebf3f3661268f31657625e91ceb82813020592e0751e106852fdd973ec30be5  ~/.gemini/config/mcp_config.json
b08afe62666ac23b510d431bc47138b4092f8ed65b92236e13ce5e74627b861e  ~/.gemini/antigravity-cli/settings.json
599b6f8dcfb30cf069198294129231df68202c1390bd9ad3eb4bd652bd00e51b  ~/.codex/hooks.json
3edb73778aecb295326dc0b29940500236ed421761226bfb4dd6e1a8bd6bdcd3  ~/.codex/config.toml
```

While installed: every key of `~/.claude/settings.json` outside `hooks` was equal and its two foreign hook entries stayed; the Antigravity MCP file kept the person's servers beside `mesa-vault` and `mesa-decisions`; the Antigravity settings kept every key and gained only `mcp(mesa-decisions/*)`. One difference that is not content: `~/.claude/settings.json` was group `wheel` before; Mesa's atomic write recreated it as group `staff`, and the restore kept the new inode (same bytes, same mode `0600`).

## Bugs fixed in this run

1. `3f2d6542` fix(sessions): exec codex after the goal's background ask, so send reaches it. `sessionWindowCommand` now execs an agent command that does not exec itself whenever the background ask precedes it; test in `agents/codex/decision-assistance.test.ts`. Live: the Codex pane runs `codex`, and `send` works.
2. `064b2a25` fix(sessions): an Antigravity skill run shows its advice as unsupported, not configured; test in `agents/antigravity/decision-assistance.test.ts`.

## Findings after the run

- Fixed after the run: `PER_TURN_MS` bounded Mesa's own work, not node's start (about 0.34 s here), so a deadline miss cost about 1.8 s of turn wall time. The hook's budget now counts from the process start (`processStartedAt`, set by the CLI entrypoint), so the whole hook stays within 1,500 ms.
- Fixed after the run: `mesa rm` left `~/.mesa/<profile>/sessions/decisions/<id>.json` behind; it now deletes it with the record.
- Codex `/clear` and Antigravity `/clear` end decision assistance for that window until it is reopened through Mesa, by the existing identity rule (Codex even says `source: clear`). Following an explicit clear, as Mesa does for Claude Code, would make those cells pass; it is an identity decision, left to the owner.

## Cleanup

Done: every session of the invented project removed (`mesa rm --force`, its three worktrees and branches with `--delete-worktree --delete-branch`), their handoff notes and decision state files deleted, `mesa unregister basalt-harbor`, the invented note removed from the `p11-live` vault, `tmux -L mesa-p11-live kill-server`, the global files restored from their copies, the scratch folder deleted (the Codex home with its copied login included). Profile `p11-live` and its keys stay, model `clef`. Left for the epic's final cleanup: folder-trust entries for the scratch project and its worktree paths in `~/.claude.json`, Antigravity's trusted folders, and the native transcripts of these runs under `~/.claude/projects/` and `~/.gemini/antigravity-cli/` (invented content only).
