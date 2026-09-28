# Spike: a session's context use, read from outside the session

Issue: #70. Date: 2026-09-25. macOS (Darwin 25.6.0), tmux 3.7c, Claude Code 2.1.283.

Codex: not covered. v1 is Claude Code only, and Codex is tracked in #43.

**Outcome:** read context use from the session's transcript. Take the last main-chain assistant message's `usage`, and divide it by the window the model and its settings imply. At rest, all eleven readings match the status line after rounding, and the largest raw difference is 0.48 points. While a request is in flight, the transcript trails by that request. The model id alone does not give the window: a native-1M model is held to 200k by `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, and the transcript cannot tell the two apart. The record field is `context: {used, window, at, source: 'transcript'}`, with `used` in percent of `window`.

## What was compared

- **Ground truth.** The owner's status line command writes `context_window.used_percentage` to `~/.claude/context/<agent session id>.pct` on every refresh, as an integer. The status line docs (https://code.claude.com/docs/en/statusline, read 2026-09-25) say it "is calculated from input tokens only: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. It does not include `output_tokens`." They give `context_window_size` as "200000 by default, or 1000000 for models with extended context".
- **Candidate.** In the transcript `~/.claude/projects/<folder>/<agent session id>.jsonl`, take the last entry that meets three conditions:
  - its `type` is `assistant`;
  - it is main-chain, that is not `isSidechain`, since a subagent's messages run in the subagent's own context;
  - it carries `message.usage`.

  Then `used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, and the percentage is `100 * used / window`. The candidate reads these fields only, never message content: `type`, `isSidechain`, `timestamp`, `message.model`, `message.usage`, and, for compaction, `subtype` and `compactMetadata`.
- **Sessions.** Spike sessions ran in a scratch folder of invented filler files, on a private tmux socket (`-L spike70 -f /dev/null`), with the owner's permission for each. Prompts were typed with `send-keys`.
  - **H**: `claude --model haiku`, which reports `claude-haiku-4-5-20251001`, a 200k window. After `/clear` it continues as **H'**.
  - **O1 to O5**: five of the owner's own sessions, all `claude-opus-5-5` with a 1M window, read at rest.
  - **O6**: `CLAUDE_CODE_DISABLE_1M_CONTEXT=1 claude --model opus`, which also reports `claude-opus-5-5` but runs with a 200k window.
- **Timing.** A reading is taken after the turn ends: the transcript has an `end_turn` assistant message newer than the prompt, and 4 s have passed so the status line can refresh.

## Results

| Point | Session, model (window) | Moment | Status line (%) | Transcript `used` (tokens) | Transcript (%) | Difference |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | H, haiku-4-5 (200k) | after the first reply | 21 | 42,324 | 21.16 | 0.16 |
| 2 | H, haiku-4-5 (200k) | after reading three ~95 KB files | 76 | 151,574 | 75.79 | 0.21 |
| 3 | H, haiku-4-5 (200k) | one more reply | 76 | 151,813 | 75.91 | 0.09 |
| 4 | H, haiku-4-5 (200k) | `/compact`, then one reply | 21 | 41,584 | 20.79 | 0.21 |
| 5 | H', haiku-4-5 (200k) | first reply after `/clear` | 21 | 42,430 | 21.21 | 0.21 |
| 6 | O1, opus-5-5 (1M) | at rest | 5 | 51,827 | 5.18 | 0.18 |
| 7 | O2, opus-5-5 (1M) | at rest | 18 | 179,427 | 17.94 | 0.06 |
| 8 | O3, opus-5-5 (1M) | at rest, one compaction earlier | 24 | 241,734 | 24.17 | 0.17 |
| 9 | O4, opus-5-5 (1M) | at rest | 57 | 565,522 | 56.55 | 0.45 |
| 10 | O5, opus-5-5 (1M) | at rest | 78 | 784,834 | 78.48 | 0.48 |
| 11 | O6, opus-5-5 held to 200k | after the first reply | 23 | 45,656 | 22.83 | 0.17 |

**Largest difference at rest: 0.48 points** (point 10). Every transcript percentage rounds to the status line's integer, so the only error measured is the status line's own rounding. That is well inside 5 points. Point 11 over a 1M window would read 4.57 %, five times too low.

Two kinds of reading were not at rest, and they show the method's limits:

- **While a turn runs.** An early helper waited on `esc to interrupt`, which a custom status line hides (see Other observations), so it read three points mid-turn: 33 against 21.30, 40 against 39.73, and 58 against 51.50. The transcript was one API call behind. Its usage per call ran 21.30, 33.13, 39.35, 39.73, 51.50, 57.76, and so on, and the status line's 33 and 58 are the next call's 33.13 and 57.76. That call's request already held the last tool result, and its assistant entry was not written yet. The lag reached 11.7 points here, and one large tool result could make it larger, however often Mesa looks. It is gone once the turn ends (point 2).
- **Right after `/compact`, before the next reply.** The status line read 0: the docs say `current_usage` is "`null` ... immediately after `/compact` until the next API call repopulates it". The transcript's last usage still said 151,813 (75.91 %), which is stale. The next reply brought both to 21 (point 4).

## Window size

No transcript entry records the window, and `message.model` carries no window suffix. The window depends on the model and on how Claude Code was started. The model-config docs (https://code.claude.com/docs/en/model-config, read 2026-09-25) give the rules:

- **Native 1M.** "Opus 4.7 and later", Sonnet 5, and the Fable models have a native 1M window on the Anthropic API.
- **200k for the same models.** `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` "treats them as having a 200K context window", as do third-party providers (Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry). Point 11 measured this: the same `claude-opus-5-5` in the transcript, with the status line reading against 200k.
- **Other models.** A model outside those lists, such as Haiku 4.5, has 200k (points 1 to 5).

So the window is the model's native window from a table Mesa keeps, held to 200k when Mesa can see `CLAUDE_CODE_DISABLE_1M_CONTEXT` or a third-party provider:

- in the environment Mesa starts claude with (its tmux server's environment and the window's `-e` variables), or
- in the `env` block of Claude Code's settings.

A model missing from the table has an unknown window. Guessing the 200k default would overstate a 1M session five times over and trigger a false handoff (#76). So the field is left out.

The exact alternative is to wrap the user's `statusLine` command and tee its stdin, which carries `context_window_size`. That edits the user's settings, and it works only for interactive sessions whose status line refreshes. Take it only if the rules above prove wrong.

Auto-compaction is a second limit. A native-1M session compacts "at about 967K tokens by default", and `autoCompactWindow`, `/autocompact`, or `CLAUDE_CODE_AUTO_COMPACT_WINDOW` can move that point, for example to 500k, or 50 % of a 1M window. #76's threshold is a percent of the window, so it never fires when compaction comes first.

## After compaction

Compaction keeps the agent session id and the transcript. It appends a `system` entry with `subtype: compact_boundary`, whose `compactMetadata` holds `trigger`, `preTokens` (151,856 here), and `postTokens` (9,354). `postTokens` counts only the kept messages. The next reply measured 41,584 once the system prompt and tools were back in, so `postTokens` is not context use. Until the next assistant message, Mesa has no reading. That matches the status line, which reads 0 then.

## After `/clear`

`/clear` starts a new conversation in the same process:

- It gets a new agent session id (`f60bdea1-...` after `92a2dd8e-...`) and a new transcript file in the same project folder.
- The status line writes a new `.pct` file under the new id.
- The old transcript and the old `.pct` file freeze at their last values.
- `claude agents --json` reports the new `sessionId` for the same pid. `list.ts` matches listing rows by pane pid first, so the row still lands on the record.

The spike's O6 run had a temporary hook, loaded with `--settings` and recording only the event name, agent session id, `source`, and `reason`. It captured the hooks in this order:

| Moment | Hook | Agent session id | `source` / `reason` |
| --- | --- | --- | --- |
| start | `SessionStart` | old | `startup` |
| `/clear` | `SessionEnd` | old | `clear` |
| `/clear` | `SessionStart` | new | `clear` |
| `/exit` | `SessionEnd` | new | `prompt_input_exit` |

Mesa's record keeps the old `agentSessionId`. From the code, not observed through Mesa, three things follow:

- **`SessionEnd` still passes.** It carries the old id, so `recordHookEvent`'s guard lets it through, and it is recorded.
- **The session reads `done`.** `hookState` in `packages/core/src/sessions/state.ts` maps every `SessionEnd` to `done`. A non-waiting hook state holds over a disagreeing listing for 60 s, so the Board shows the session `done` at 0.95 for up to a minute, with Resume offered.
- **Every later event is dropped.** `recordHookEvent` in `packages/core/src/sessions/hook-events.ts` drops any hook event whose `session_id` differs from the record's, to ignore nested claudes, and every event after `/clear` carries the new id.

A transcript read by the old id returns the frozen, pre-clear value.

**Follow-up #92** makes the record follow the new id, from the `SessionStart` with source `clear` and from the listing's `sessionId` for the pane's pid. It also keeps a `SessionEnd` with reason `clear` from ending the session. #75 depends on it.

## Decision

The record gets `context: {used, window, at, source}`:

- `window`: tokens, by the rules in Window size.
- `used`: percent of `window`, `100 * (input_tokens + cache_creation_input_tokens + cache_read_input_tokens) / window`, from the last main-chain assistant message with `usage` in the session's transcript. The transcript is found by its agent session id.
- `at`: that message's `timestamp`.
- `source`: `transcript`.

The field is left out in four cases:

- no such message exists yet;
- a `compact_boundary` follows it;
- the window is unknown;
- the transcript is missing.

Only at rest is it exact to the status line's rounding. While a request is in flight it trails by that request, as the hooks reference warns: "The transcript file is written asynchronously and may lag the in-memory conversation, so it may not yet include the current turn's most recent messages when a hook fires." So a reading taken at a `Stop` hook can be one call stale, and a later look corrects it. Anything that acts on the value, such as #76's handoff, should act on a reading taken at rest.

This changes ADR-0003's statement that Mesa reads only session ids and timestamps from transcripts, so the ADR gets an amendment.

**For #75.** These are measurements, not decisions:

- Hook payloads carry the transcript path as `transcript_path`. Every transcript seen sat in the folder of the session's working directory.
- A transcript can reach megabytes: point 10's is 9,033,461 bytes. Reading it from the end finds the last assistant message without reading the rest.
- CONTEXT.md gets an entry for context use, and for the record field `context`. CONTEXT.md already lists "context" as a name to avoid for the composition root.

## Reproduction

1. **Start a session.** In a scratch folder, run `tmux -L spike70 -f /dev/null new-session -d -s s -x 180 -y 50 -c <folder> "claude --model haiku --session-id <uuid>"`. For point 11, use `CLAUDE_CODE_DISABLE_1M_CONTEXT=1 claude --model opus ... --settings <file>`, with `SessionStart` and `SessionEnd` hooks that append only `hook_event_name`, `session_id`, `source`, and `reason` to a file.
2. **Send a prompt and wait for the turn.** Type it with `send-keys -l`, then `Enter`. Wait until the transcript's last main-chain `assistant` entry with `stop_reason: end_turn` is newer than before, then wait 4 s more.
3. **Read both values.**
   - Status line: `cat ~/.claude/context/<uuid>.pct`.
   - Transcript: in `~/.claude/projects/*/<uuid>.jsonl`, the last entry with `type` `assistant`, not `isSidechain`, and with `message.usage`. Sum its three input counts, then divide by the window.
4. **Grow and reset the context.**
   - Grow it with prompts that read the filler files: `Read part1.txt in full and reply with only its last line.`
   - Compact with `/compact`, then send one more prompt.
   - Clear with `/clear`, then send one more prompt and read the new agent session id's files.

## Cleanup

- **Spike sessions.** Each ended with `/exit`, then `tmux -L spike70 kill-server` and `rm -f /private/tmp/tmux-501/spike70`. `ls /private/tmp/tmux-501/` then showed only Mesa's `mesa-verify` socket.
- **Kept, with the owner's permission.** The scratch folder (outside the repo), the spike sessions' transcripts under `~/.claude/projects/`, and their `.pct` files.
- **Owner's settings.** `~/.claude/settings.json` was not changed.

## Other observations

- **The busy hint is hidden.** The status line docs say that with a custom status line, Claude Code "stops showing most of the footer's keyboard hints, including `esc to interrupt`". That is why the spike's first helper returned mid-turn. Mesa's tail classifier (`packages/core/src/sessions/state.ts`) also matches `esc to interrupt`, but it checks the spinner activity label and the token stats line too. The spike did not test which of those match on a screen with a custom status line. The tail is ADR-0003's last signal, read only when no hook or listing speaks.
- **Starting context.** The Haiku session started at 42,324 tokens (21 % of 200k) before any work, and each Opus session at 45,000 to 52,000 (about 5 % of 1M, or 23 % of 200k). That is the system prompt, tools, and skills.

## Codex CLI 0.157.1, P4 #265

In the invented `lantern-cove` checkout, `codex exec --json -C <checkout> -c approval_policy=never -c sandbox_mode=workspace-write 'Reply with exactly READY.'` returned `READY` and `turn.completed` usage. Its newly written rollout had `task_started.model_context_window: 258400`, a `turn_context` naming model `gpt-6-sol` and effort `xhigh`, and a later `event_msg` with `payload.type: token_count`. That event's `info.last_token_usage.input_tokens` was 25,942, of which 12,544 were cached, and its `info.model_context_window` was 258,400. Cached tokens are a subset of input tokens, so the context reading is `100 * 25942 / 258400 = 10.04%`; the `total_token_usage` field is cumulative billing and is not used. The timestamp on the token-count event supplies freshness. No user project or existing transcript was read for this qualification.

Mesa reads the last valid `token_count` event from the exact thread's rollout and leaves context unknown before such an event or when its native window is missing. The public `mesa show` path first learns a Codex-owned thread ID if necessary, then reads its context. A local check against this invented native rollout returned `{used: 10.04, window: 258400, source: transcript}`. Live multi-turn and post-compaction semantics remain unqualified; the stored `at` makes an older reading visible rather than implying it is current.
