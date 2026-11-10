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

Haiku also kept 6 items Opus dropped, and Sonnet kept 1. The owner chose Haiku: it recalls more of what Opus keeps than Sonnet does, at a twentieth of Opus's cost, and #880's cap of 3 items per run bounds its extra items. On the 463 baseline runs Haiku would have cost about $20 instead of $380. Recheck capture receipts a week after release, and move to Sonnet if noise rises.

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

The owner chose 200k tokens for both the handoff and amber, with red at 250k, whatever the window size. That change is a separate pull request; this one only records the measurement.
