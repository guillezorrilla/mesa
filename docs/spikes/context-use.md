# Spike: a session's context use, read from outside the session

Issue: #70. Date: 2026-09-25. macOS (Darwin 25.6.0), tmux 3.7c, Claude Code 2.1.283.

**Outcome:** read context use from the session's transcript. Take the last main-chain assistant message's `usage` and divide by the window its `model` implies. At rest, all ten readings match the status line after rounding, and the largest raw difference is 0.48 points. The record field is `context: {used, window, at, source: 'transcript'}`.

## What was compared

- **Ground truth.** The owner's status line command writes `context_window.used_percentage` to `~/.claude/context/<session_id>.pct` on every refresh. That value is an integer. The status line docs (code.claude.com/docs/en/statusline, read 2026-09-25) say it "is calculated from input tokens only: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. It does not include `output_tokens`." They say `context_window_size` is "200000 by default, or 1000000 for models with extended context".
- **Candidate.** In `~/.claude/projects/<slug>/<agent session id>.jsonl`, take the last entry that meets three conditions:
  - its `type` is `assistant`;
  - it is not `isSidechain`, since subagents run in their own context;
  - it carries `message.usage`.
  Then `used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, and the percentage is `100 * used / window`. Only `message.model`, `message.usage`, `timestamp`, and `type` were read, never message content.
- **Sessions:**
  - **200k window.** Session H is `claude --model haiku`, which reports `claude-haiku-4-5-20251001`. It ran in a scratch folder of invented filler files, on a private tmux socket (`-L spike70 -f /dev/null`), with the owner's permission. Prompts were typed with `send-keys`.
  - **1M window.** Five of the owner's own Claude Code sessions (O1 to O5), all `claude-opus-5-5`, read when they were at rest.
- **Timing.** Each reading was taken after the turn ended: the transcript had an `end_turn` assistant message newer than the prompt, and 4 s had passed so the status line could refresh.

## Results

| Point | Session, model | Moment | Status line (%) | Transcript `used` | Transcript (%) | Difference |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | H, haiku-4-5 (200k) | after the first reply | 21 | 42,324 | 21.16 | 0.16 |
| 2 | H, haiku-4-5 (200k) | after reading three ~95 KB files | 76 | 151,574 | 75.79 | 0.21 |
| 3 | H, haiku-4-5 (200k) | one more reply | 76 | 151,813 | 75.91 | 0.09 |
| 4 | H, haiku-4-5 (200k) | `/compact`, then one reply | 21 | 41,584 | 20.79 | 0.21 |
| 5 | H after `/clear`, new id, haiku-4-5 (200k) | first reply after `/clear` | 21 | 42,430 | 21.21 | 0.21 |
| 6 | O1, opus-5-5 (1M) | at rest | 5 | 51,827 | 5.18 | 0.18 |
| 7 | O2, opus-5-5 (1M) | at rest | 18 | 179,427 | 17.94 | 0.06 |
| 8 | O3, opus-5-5 (1M) | at rest, one compaction earlier | 24 | 241,734 | 24.17 | 0.17 |
| 9 | O4, opus-5-5 (1M) | at rest | 57 | 565,522 | 56.55 | 0.45 |
| 10 | O5, opus-5-5 (1M) | at rest | 78 | 784,834 | 78.48 | 0.48 |

**Largest difference at rest: 0.48 points** (point 10). Every transcript percentage rounds to the status line's integer, so the only error measured is the status line's own rounding. That is well inside 5 points.

Two readings do not count as agreement, and they show the method's limits:

- **While a turn runs.** An early helper returned before its turns ended, so three readings were taken mid-turn. There the transcript trailed the status line by up to 11.7 points: 33 against 21.30, 40 against 39.73, and 58 against 51.50. By the end of the turn the two agreed again (point 2). A board looking every 2 s is at most one turn behind.
- **Right after `/compact`, before the next reply.** The status line read 0. The docs say `current_usage` is "`null` ... immediately after `/compact` until the next API call repopulates it". The transcript's last usage still said 151,813 (75.91 %), which is stale. The next reply brought both to 21 (point 4).

## Window size

The transcript never records the window. Its only mention of `[1m]` is inside skill text, and `message.model` carries no window suffix. So the window comes from the model id:

| Model id in the transcript | Window | Evidence |
| --- | --- | --- |
| `claude-haiku-4-5-20251001` | 200,000 | points 1 to 5 |
| `claude-opus-5-5` | 1,000,000 | points 6 to 10, and all 9 Opus 5.5 sessions with a status line file on this machine |

A model missing from the table has an unknown window. Guessing the 200k default would overstate a 1M session five times over and trigger a false handoff (#76), so Mesa records `window: null` instead. It keeps `used`, and the Board shows tokens without a percentage.

The spike did not test whether Opus 5.5 can run with a 200k window. If it can, its transcript looks the same as a 1M one's. The exact alternative would be to wrap the user's `statusLine` command and tee its stdin, which carries `context_window_size`. That edits the user's settings, though, and it works only for interactive sessions whose status line refreshes. Take it only if the table turns out wrong.

## After compaction

Compaction keeps the session id and the transcript. It appends a `system` entry with `subtype: compact_boundary`, whose `compactMetadata` holds `trigger`, `preTokens` (151,856 here), and `postTokens` (9,354). `postTokens` counts only the kept messages. The next reply measured 41,584 once the system prompt and tools were back in, so `postTokens` is not context use. Until the next assistant message, Mesa reports no reading. That matches the status line, which shows nothing, since `current_usage` is `null`.

## After `/clear`

`/clear` starts a new Claude Code session in the same process:

- It gets a new session id (`f60bdea1-...` after `92a2dd8e-...`) and a new transcript file in the same project folder.
- The status line writes a new `.pct` file under the new id.
- The old transcript and the old `.pct` file freeze at their last values.
- `claude agents --json` reports the new `sessionId` for the same pid.

Mesa's record keeps the old `agentSessionId`. `recordHookEvent` (packages/core/src/sessions/events.ts) drops any hook event whose `session_id` differs from the record's, which it does to ignore nested claudes. So after `/clear`, every hook event of the session is dropped. Its state falls back to the listing, and a transcript read would return the frozen, pre-clear value. The hooks reference lists `clear` among `SessionStart`'s matcher values.

**Follow-up #92** makes the record follow the new id: from a `SessionStart` with source `clear`, and from the listing's `sessionId` for the session's pane pid. #75 depends on it.

## Decision

The record gets `context: {used, window, at, source}`:

- `used`: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` of the last main-chain assistant message with `usage` in the session's transcript. Find the transcript by its id, `~/.claude/projects/*/<agentSessionId>.jsonl`, since the id is unique. Hook payloads also carry the path as `transcript_path`.
- `window`: from the model table above. `null` for a model not in it.
- `at`: that message's `timestamp`.
- `source`: `transcript`.

The field is left out when no such message exists yet, or when a `compact_boundary` follows it. It is read by the agent session id #92 keeps current. The reading costs one file read per look. A transcript can reach megabytes (point 10's is 9,033,461 bytes), so #75 reads it from the end.

This changes ADR-0003's statement that Mesa reads only session ids and timestamps from transcripts, so the ADR gets an amendment.

## Other observations

- The status line docs say that with a custom status line, Claude Code "stops showing most of the footer's keyboard hints, including `esc to interrupt`". That is why the spike's first helper, which waited on that text, returned mid-turn. Mesa's tail classifier (`session-state.ts`) also matches `esc to interrupt`, but it checks the spinner activity label and the token stats line too. The spike did not test which of those match on a screen with a custom status line.
- The Haiku session started at 42,324 tokens (21 % of 200k) before any work, and each Opus session started at about 51,800 (5 % of 1M). Those tokens are the system prompt, tools, and skills.
