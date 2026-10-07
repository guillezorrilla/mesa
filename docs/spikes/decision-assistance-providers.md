# Decision assistance across coding providers (#463)

Status: skeleton. Every cell below is **pending live run**. The code and fixture tests are in the branch; the lead fills in versions, results and sanitized evidence after the live matrix.

Date: (lead fills in). Mac: (lead fills in). Claude Code: (version). Codex CLI: (version). Antigravity CLI: (version). Mesa: (commit). Decision model: `clef` on profile `p11-live` (TypeSafe key also set, so `jev` is one `mesa decisions use jev` away).

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
| Clear | `$MESA $P send $ID "/clear"`, then the later-turn prompt | `$MESA $P send $ID "/clear"` if the installed version has it, else untested | unsupported (no clear command observed) |
| Compact | `$MESA $P send $ID "/compact"`, then the later-turn prompt | `$MESA $P send $ID "/compact"` | unsupported (no `/compact`, ADR-0012) |
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
| Fresh: tool called | pending live run | pending live run | pending live run |
| Fresh: advice consumed | pending live run | pending live run | pending live run |
| Resumed: tool called | pending live run | pending live run | pending live run |
| Resumed: advice consumed | pending live run | pending live run | pending live run |
| Worktree | pending live run | pending live run | pending live run |
| Handoff | pending live run | pending live run | pending live run |
| Queued | pending live run | pending live run | pending live run |
| Headless | pending live run | pending live run | pending live run |
| Background | pending live run | unsupported | unsupported |
| Clear | pending live run | pending live run (untested if the version has no `/clear`) | unsupported |
| Compact | pending live run | pending live run | unsupported |
| No key: nothing mounted or sent | pending live run | pending live run | pending live run |
| Off: no advice, no tool | pending live run | pending live run | pending live run |
| Outside Mesa: inert | pending live run | pending live run | pending live run |
| Global files byte for byte after uninstall | pending live run | pending live run | pending live run |
| Added turn latency (hook, p50 / p95; the hook's own budget is 1,500 ms) | pending live run | pending live run | pending live run |

Known limits going in: Antigravity's advice is the saved goal's only (its hook carries no prompt), so a session with no goal gets none (`show` says unsupported); a session started before the key cannot gain the tool until it is restarted (`show` says missing, with a restart action); Codex delivers nothing until the person reviews Mesa's changed hooks.

## Cleanup

`$MESA $P hooks uninstall`, compare the hashes above, `$MESA $P unregister basalt-harbor`, remove the invented note from the p11-live vault, `tmux -L mesa-p11-live kill-server`, `rm -rf "$SCRATCH"` (the Codex home with its copied login included). Folder-trust entries for `basalt-harbor` in `~/.claude.json`, Codex and Antigravity stay until the epic's final cleanup.
