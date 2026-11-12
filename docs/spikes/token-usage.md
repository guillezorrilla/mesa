# Spike: where Mesa's tokens go

Date: 2026-11-10. Issue: #908. Measured on the owner's `default` profile from `~/.mesa/<profile>/usage.json` (one row per agent reply: model, input, output, cache read and cache write tokens, estimated list-price cost), joined to the session records. Only aggregate numbers are written here.

## Baseline (2026-10-05 to 2026-11-10)

- 44,531 replies, about $4,150 at list prices.
- Tokens: cache reads 97.1%, cache writes 2.6%, output 0.26%, uncached input under 0.01%. A turn's cost is mostly its context being read again, so it grows with how long the session already is.
- Vault capture runs: 463 runs, about $380 (9%), all on `claude-opus-5-5`. A median run took 10 turns, wrote 81k tokens to the cache, and read 290k from it; its conversation input was a few thousand characters. A capture costs its session overhead, not its transcript.
- Spend by the context a turn carried:

  | Context per turn | Share of spend |
  | --- | --- |
  | under 100k | 23% |
  | 100k to 200k | 22% |
  | 200k to 400k | 24% |
  | over 400k | 32% |

## Step 1: the capture model

Six real windows that no capture had seen yet were replayed through the stricter `vault-capture` skill of #880, with mesa-vault's read tools live and its write tools disallowed, on Opus, Sonnet and Haiku (`claude -p '/vault-capture' --model <m>`). Windows that had already been captured were not usable: their items were already in the vault, so each model dropped them all.

| Model | Items | Opus items recalled (of about 4 that pass the bar) | Cost per run | Turns |
| --- | --- | --- | --- | --- |
| Opus 5.5 | 6 | - | $0.78 | 8.7 |
| Sonnet 5.5 | 2 | 1 | $0.31 | 5.0 |
| Haiku 5.5 | 8 | 2 | $0.04 | 7.3 |

Haiku also kept 6 items Opus dropped, and Sonnet kept 1. The owner chose Haiku: it recalls more of what Opus keeps than Sonnet does, at a twentieth of Opus's cost, and #880's cap of 3 items per run bounds its extra items. On the 463 baseline runs Haiku would have cost about $20 instead of $380. A 10-input comparison with Sonnet kept Haiku (`docs/spikes/capture-model.md`, #1057). Since #1000, git text and session summaries run on Haiku too, and import notes on Sonnet.

## Step 2: what makes context grow

First-turn context, before any work, is a median of 62k tokens for interactive sessions (85 sessions) and 80k for capture runs (462). Probes with `claude -p --model haiku` in an empty folder attribute it:

| Probe | First-turn tokens |
| --- | --- |
| The owner's full setup | 44,300 |
| Without user MCP servers (`--strict-mcp-config`) | 32,300 |
| Without user settings, plugins and hooks (`--setting-sources project,local`) | 19,000 |
| That, with mesa-vault and mesa-decisions mounted | 19,000 |

What Mesa itself adds is small. MCP tools are deferred behind tool search, so the schemas cost nothing up front. The SessionStart pointer is capped at 1,000 bytes plus two lines, about 350 tokens. Per-prompt decision advice averages about 250 characters, about 750 tokens per session at the median (72 sessions). The rest of the overhead is the person's own plugins, hooks and MCP servers.

Session length is the lever. The `mesa-handoff` skill and the Board's context tones counted a percent of the window (hand off and amber at 55%, red at 60%). Every session runs a 1M window, so that meant about 550k tokens, past most of the expensive turns. Replaying the history with a successor that starts from 70k when a session crosses a threshold gives an upper bound on the saving, since a successor re-reads some files:

| Hand off at | Spend saved | Handoffs in 5 weeks |
| --- | --- | --- |
| 200k tokens | 40% | about 1,900 |
| 250k tokens | 36% | about 1,600 |
| 300k tokens | 33% | about 1,350 |
| 550k tokens (55% of 1M) | 16% | about 530 |

The owner first chose 200k tokens (#911), then went back to 55% and 60% of the window before it shipped, judging 200k too low for a 1M window. The thresholds stay as they were.

## Step 3: a large-read guard

[Spotify's approach](https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90) blocks a whole-file read over N lines and points the agent at a targeted read or a cheap subagent. Its stated caveats are 10 to 30 s of latency per summary, and no editing or reasoning from a summary. A guard can only save what large reads put into the context. The method: every interactive Claude Code session in the profile whose transcript is still on disk (85), main chain only. Each tool result's characters are counted, then weighted by the number of assistant turns after it, since every later turn re-reads it. Lines are assumed at about 40 characters.

| Tool result | Share of tool-result characters | Share of re-read weight |
| --- | --- | --- |
| Bash, all | 53% | 49% |
| Bash `cat`, `head`, `tail`, `sed -n` | 11% | 8% |
| Read of a whole file | 4% | 3% |
| Read of a whole file over 20,000 characters (about 500 lines) | 3% | 3% |
| `cat`-style Bash output over 20,000 characters | 1% | 1% |

A guard on reads over about 500 lines could remove at most about 4% of the re-read tool-result weight (the last two rows, 2.8% and 0.8% unrounded), and tool results are only part of a session's context. That is too small a cut for the latency and the summary-only reads, so Mesa does not build the guard. The larger share is Bash output in general: test, build and diff output. Results over 10,000 characters are 21% of Bash's result characters, spread over many commands.

## Step 4: Mesa's own skill runs without the person's setup (2026-11-10, #1007)

Each of Mesa's own Claude skill runs (vault-capture, git-text, session-summary, import-notes) started with the person's full setup: their MCP servers, user settings, plugins and hooks. A pipeline run's output is landed by core (ADR-0006), so it needs none of them. Probed as Step 2, `claude -p 'Reply with OK.' --no-session-persistence --output-format json` in an empty folder, with the window variables unset so no hook logs into a session; the first turn's input, cache read and cache write tokens:

| Run | Before | After |
| --- | --- | --- |
| vault-capture (Haiku, mesa-vault) | 44,337 | 18,985 |
| git-text (Haiku, no server, low effort) | 44,337 | 18,985 |
| session-summary (Haiku, no server, low effort) | 44,337 | 18,985 |
| import-notes (Sonnet, mesa-vault) | 43,514 | 18,162 |

Before, each probe carried the run's flags as they were: `--model haiku` (or `sonnet`), `--permission-mode default`, `--mcp-config` with mesa-vault and mesa-decisions (the profile has a Decision model), and `--allowedTools mcp__mesa-vault mcp__mesa-decisions`. After, the same with `--strict-mcp-config --setting-sources project,local '--settings={"disableAllHooks":true}'`, `--mcp-config` holding mesa-vault alone for vault-capture and import-notes and nothing for git-text and session-summary, and `--effort low` for those two. Effort changes no first-turn context; it cuts the reply's thinking.

A live `mesa run session-summary --session <id>` in a throwaway profile, on an invented project, landed its summary, and `mesa usage --session <run>` read its first turn at 20,253 tokens (2 input, 11,873 cache read, 8,378 cache write), its skill and the session's log included, against the 80k median of capture runs in Step 2. `mesa run vault-capture` on the same session ran, chose nothing to keep from a two-line log, and landed nothing.

Git text (#1008, 2026-11-10): the patch a `git-text` run reads is 60 KB, down from 200 KB, split fairly by file (`cutPatch`, `git/recipes.ts`), so a lockfile or generated file at the top of a patch no longer hides every file after it, and a commit message or pull request text reads the shape of each change.

## Step 5: measured after epic #1003 (2026-11-11)

The same invented workload ran on the build before #1012 (`8eab5ae2`) and on main after #1013 (`0eeb5e88`), each in its own throwaway profile with an invented project: a terminal session printing 200 lines, then `mesa run session-summary --session <id>`, `mesa run vault-capture --session <id>`, and `mesa git message` on a staged 150 KB `package-lock.json` plus two small source edits. Read with `mesa usage --session <run> --json`: the first turn's input, cache read and cache write tokens, and the run's estimated cost. Haiku throughout, one run each.

| Run | First turn before | First turn after | Cost before | Cost after |
| --- | --- | --- | --- | --- |
| session-summary | 62,270 | 37,037 | $0.0116 | $0.0058 |
| vault-capture | 63,301 | 38,177 | $0.0102 | $0.0065 |
| git message | 240,346 | 92,203 | $0.2307 | $0.0164 |

Under the lean flags the vault-capture run called mesa-vault's `project_context` and `search_vault`, took 3 turns where the earlier build's took 1, and its note landed. The git message run read the 60 KB fair cut (#1008) where the earlier build read 200 KB.

A replay of the owner's last 30 days, counting only, over 55 child sessions under 27 parents: 1,241 finished-turn reports under the old rule, 58 under the 120 s hold (#1004), and batching siblings due together merged none of those. A child's implicit report text was already at most 203 characters, the hook log's cut (`redactPayload`), so the 600-character cap (#1005) acts on explicit reports only.

Caveats: one run each, so the turn counts can vary. The replay counts reports, not wakes: priced at each parent's latest context reading, the 1,183 reports it holds back come to about 17M tokens a day, an upper bound, since a busy parent took its reports at its own turn end without a wake and a reading taken late overstates the context at the time.

## Step 6: the agent view of `mesa sessions` (2026-11-11, #1025)

On the owner's profile `mesa sessions --json` printed 192,561 bytes (79 rows of 28 fields) and `--all` 1,289,583, and a coordinator that checks its workers that way rereads it every later turn. Inside a session's window it now prints the agent view (CONTEXT.md, Agent view); `--full` and every caller outside a window get the whole rows.

Measured on a throwaway profile with 50 invented sessions (10 parents with 4 children each, each in its own worktree with a one-line goal), no foreign rows, the CLI built from this branch:

| `mesa sessions --json` | bytes |
| --- | --- |
| outside a window (before, and unchanged) | 83,824 |
| inside a window, `--full` | 83,824 |
| inside a window, agent view | 10,511 |

The agent view is 87% smaller: about 2,600 tokens a reread instead of 21,000, at 4 bytes a token. The owner's real rows carry longer goals, replies and placements, so the cut there should be at least as large; not measured on that profile.

## Step 7: round two, after epics #1003 and #1020 (2026-11-12)

The owner asked two things: should Mesa ship the ponytail plugin, and should Mesa have its own cheap way to read many files, like Spotify's. Measured on the default profile: `usage.json` from 2026-10-05 to 2026-11-12 (53,148 replies), and the 153 interactive Claude Code transcripts active since 2026-10-22, main chain only. Only aggregate numbers are written here.

### The token work has not reached the owner yet

The installed app is 0.3.12, tagged 2026-11-02. Every token change since then (#909, #912, #931, #1002, #1007, #1011, #1012, #1027, #1028, #1039, #1042) is merged but unreleased, so the owner's usage cannot show their effect yet. Vault captures still run on Opus: 9.3% of spend from 2026-11-10 to 2026-11-12 ($73 in under three days). On Haiku that share would drop to about a twentieth (Step 1). Spend by session kind:

| Period | Spend a day | Interactive (top level) | Child sessions | No record left | Vault capture |
| --- | --- | --- | --- | --- | --- |
| 10-05 to 10-31 | $109 | 11% | 34% | 46% | 8.5% |
| 11-01 to 11-09 | $128 | 14% | 16% | 60% | 10.8% |
| 11-10 to 11-12 | $286 | 11% | 42% | 38% | 9.3% |

The rise is more and longer work, not a change in what fills context. Output is still under 0.4% of tokens in every kind.

### What fills context now

Each transcript item's characters are weighted by the assistant turns after it in the same stretch (a compaction starts a new one), as in Step 3. The items cover about 49% of the tokens `usage.json` records for these sessions; the rest is the system prompt, tool definitions and tool inputs. So a share of the weight below is about half that share of all context tokens.

| What | Share of weight |
| --- | --- |
| Tool results | 49% |
| Text injected at session start or per prompt: skill listing 7.6%, deferred tool names 6.5%, instruction files 4.1%, MCP server instructions 2.1%, agent listing 1.8%, environment 1.6%, hooks 1.1% | 25% to 32% |
| User prompts and skill bodies | 7% |
| Assistant text | 2.5% |

Within tool results, file reads through Bash (`cat`, `head`, `tail`, `sed -n`, `wc`) are 38% of the weight, searches (`grep`, `rg`, `find`, `ls`) 12%, diffs 4%, the Read tool 4%, tests 2.5%, builds and lint 1.9%. Step 3 put Bash file reads at 8%: it classed a command by its first word, and agents start most commands with `cd <dir> &&`. Stripping that prefix moves them out of "Bash, other".

Injected text, per session: ponytail's SessionStart rules 4,790 characters, superpowers 3,405, Mesa's start pointer 1,379, postman 1,180; Mesa's per-prompt decision advice averages 678 characters (610 injections). Mesa's own text is about 0.4% of the weight, about 0.2% of context.

### Candidates

| Candidate | Upper bound, share of context | Cost |
| --- | --- | --- |
| Release the merged work | Captures alone: about 9% of spend | None; a release under verification |
| Many-file reads through a cheap subagent | Runs of 5 or more read-only calls before the next other action: 10.3% of weight, about 5% of context (213 runs in 84 sessions); 3 or more files: about 7% | 10 to 30 s a question; the agent re-reads what it then edits |
| Plugins, agents and connectors loaded but never used | About 32k characters a turn, about 4% | The owner's own setup |
| A guard on whole-file reads over about 500 lines (`cat` or Read over 20,000 characters) | 2.8% of weight, about 1.4% | Blocked reads, retries |
| Trimming diffs, tests and builds beyond `mesa check` | About 1% | A wrapper per command |
| Trimming Mesa's own injected text | About 0.2% | Lost guidance |
| orca | Nothing: its token-relevant ideas (one report per worker, no polling) shipped as #1004, #1005 and #1027 | - |

Claude Code already has a many-file reader, the Explore subagent. Agents called it 246 times since 2026-10-22: 219 calls inherited the parent's model, 27 asked for Opus and none for Haiku, and all 301 Explore transcripts on disk ran on Opus. A Mesa reader command would duplicate Explore; what is missing is asking it for a cheap model.

### Ponytail

Version 5.3.2 (MIT, Dietrich Gebert). In Claude Code it injects its rules once at session start and when a subagent starts (4,790 characters, about 0.5% of context at the median turn); its per-prompt hook only tracks the mode and injects nothing, since per-prompt injection is for Qoder. Its ledger holds 772 rows across 23 projects, all at level `full`, so the owner's data has no runs without it to compare against. Its own benchmark (39 tasks, Opus 5.5, Bash disabled, 5 runs each) reports 22% fewer turns and 26% lower cost; in a long session fewer turns is what cuts cache reads.

### Decision

The owner chose (Decision model next-step: release-first 0.95, unused-setup report 0.01, Mesa reader 0.01, nothing 0.01):

- Release the merged work first; session 5aqre42z is verifying it.
- One line in the Claude start pointer: a question spread over many files goes to an Explore agent with model haiku, and the agent keeps the answer, not the files. Baseline: none of 246 Explore calls asked for Haiku; runs of 5 or more read-only calls are 10.3% of weight. Measured again after the release reaches the owner.
- Mesa recommends the ponytail plugin in its README and does not copy it: nothing to keep in sync, no attribution to carry, and a person who has the plugin never gets its rules twice.
- The owner trims the unused plugins, agents and connectors in their own setup; Mesa writes no config for it.
- Not built: a Mesa reader command, a large-read guard, more Bash trimming, trimming Mesa's injected text.
