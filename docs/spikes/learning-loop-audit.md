# Learning loop audit (#555)

Date: 2026-10-04. A free, read-only pass over the owner's own Claude Code and Codex transcripts, on the owner's Mac. Nothing left the Mac except what this Claude Code session itself read, and no transcript, vault note or agent config was changed. This report holds aggregate numbers only: no transcript text, project names, paths or session ids.

## Verdict

Within what a phrase filter and a help-lookup proxy can find, little knowledge is lost between sessions. Over 30 days, one correction recurred, in 2 sessions. One multi-step procedure was worked out again in 16 sessions. Three single-command usages were looked up again in 3 to 7 sessions, and skills for two of them already existed. Where knowledge was lost, it was mostly knowledge that was available and not used. Mesa's pull tools went almost unused: 1 of 16 Mesa sessions called a `mesa-vault` tool, and none called a `save_*` tool. That matches P11 (`docs/spikes/decision-assistance-feasibility.md`, 0/12 pull, 10/12 injected). Search runs in about 0.5 s. The trigger table at the end maps each reopen condition on #529 to these numbers. The owner decides each one on #555.

## Window and method

- **Window.** The last 30 days, to 2026-10-04, chosen by file modification time.
- **Conversations read.** 111 Claude Code transcripts, the main conversation only, with subagent transcripts left out. 366 Codex rollout files.
- **Duplicates.** 183 of the Codex files repeat the user messages of a Claude conversation or of an earlier Codex file: 60% or more of their user messages match. Each conversation is counted once, which leaves 294: 111 Claude and 183 Codex.
- **Owner sessions.** Of the 294, 152 have no typed user message, such as headless runs, sessions opened and left, or agent-to-agent threads. Another 20 are scripted qualification probes, where half or more of the messages are fixed test prompts, such as a reply-only check or a synthetic fact to recall. That leaves 122 sessions with 520 owner-typed messages: 75 Claude and 47 Codex sessions. 61 of them are in 2 projects, 43 in scratch or temporary folders, and 18 in 15 small projects. Messages injected by the harness are excluded: tags, hook output, skill bodies, compaction summaries and interrupt notices.
- **Mesa sessions.** A transcript is a Mesa session if Mesa mounted `mesa-vault` in it. In Claude Code, that shows as `mcp__mesa-vault__*` in the deferred tool list or the session-start context. In both agents, it shows as Mesa's session-start pointer, the vault line from `packages/core/src/sessions/instructions.ts`. This gives 16 Mesa sessions: 7 Claude and 9 Codex. Seven of them have owner-typed messages.
- **What was read.** User message text, tool call names, shell command lines and their exit status, and attachment types. Only the script and the author of this report read message text, on this Mac.
- **Limits.** Messages were cut at 600 characters, so a correction late in a long message is missed. Correction recall depends on a phrase filter, so a correction without a negation or a reproach is missed. A message one agent sends another cannot always be told apart from the owner's own. This session is inside the window.

## 1. Repeated corrections

**Method.** A phrase filter selected candidates from all user messages: "no", "don't", "never", "I told you", "I already", "that's not", "you should", "why did you", "instead of", "again", and similar. That gave 124 candidates. Each was then read and kept only when it corrected what the agent did or assumed. Feature requests, UI preferences, test prompts and duplicate conversations were dropped. The rest were grouped by meaning.

| Count | Value |
| --- | --- |
| Correction messages in owner sessions | 10 of 520 owner messages (the recurring correction accounts for 3, in 2 sessions) |
| Distinct corrections (grouped by meaning) | 8 |
| Distinct corrections that recur in 2 or more sessions | 1 (2 sessions) |
| ... of those, across different projects or agents | 1 (2 projects, same agent) |
| ... of those, already in global CLAUDE.md, AGENTS.md or Claude's per-project memory | 0 when it recurred; since then 1, in one project's memory only |

The recurring correction is how to write and deliver a `/goal` prompt. It came up first in one project and a day later in another. After the second time it was saved to the second project's Claude memory, which the first project does not read. The other 7 corrections each happened once: a tool or skill choice, a scope or stop instruction, a skipped check, or a wrong assumption about the owner's setup.

## 2. Re-learned procedures

**Method.** Each shell command is reduced to its tool and subcommand, such as `gh issue` or `codex exec`, for a fixed list of real binaries. Shell builtins and text tools are dropped, and so are fragments split out of heredocs. A session counts as working a procedure out when either of two things happens before its first successful use:
- the agent looked up that tool's help, or
- the agent failed with it 2 or more times.

Families that met this in 3 or more sessions were then read by hand. Failing test or build runs were dropped (`cargo test`, `vitest`, `pnpm verify`, `pnpm build`): a red test is code under change, not a procedure being worked out. Errors from running git outside a repository were dropped as well, and so was one match inside heredoc text.

| Worked out from scratch | Kind | Sessions | Projects | Agents | Already written down |
| --- | --- | --- | --- | --- | --- |
| Drive a coding agent CLI in a scripted or live run: find its permission, sandbox, MCP and output flags, then run it (`claude`, `codex`, `codex exec`, `agy` help) | multi-step | 16 | 2 | 2 | partly, in `docs/spikes/` |
| Read a GitHub issue after `gh issue view` failed (retry with `--json`) | single command | 7 | 3 | 2 | no |
| Find a `mesa` subcommand's usage | single command | 6 | 1 | 2 | yes, the `mesa` skill |
| Find the Obsidian CLI's usage | single command | 3 | 1 | 2 | yes, the `obsidian-cli` skill |

**Distinct multi-step procedures re-learned in 3 or more sessions: 1.** It is the agent CLI run, in 16 sessions. Three more single-command usages were re-learned in 3 or more sessions. No help lookup for a test runner met the bar: a test invocation was never worked out again, only re-run red. Skills for two of the single-command usages already shipped and were still not used first, which is the same pull-not-used pattern as section 3. The `agy` lookups come from Claude and Codex transcripts; Antigravity's own history was not read.

## 3. Vault tool use

**Method.** In each of the 16 Mesa sessions, calls to each `mesa-vault` tool were counted: Claude `tool_use` blocks named `mcp__mesa-vault__<tool>`, and Codex `McpToolCall` items with server `mesa-vault`. No mirrored conversation was a Mesa session.

| Tool | Mesa sessions that called it at least once | Calls |
| --- | --- | --- |
| `project_context` | 1 of 16 (6%) | 2 |
| `read_note` | 0 of 16 (0%) | 0 |
| `search_vault` | 0 of 16 (0%) | 0 |
| `session_goals` | 0 of 16 (0%) | 0 |
| `save_decision` | 0 of 16 (0%) | 0 |
| `save_summary` | 0 of 16 (0%) | 0 |
| `save_note` | 0 of 16 (0%) | 0 |

**Median `mesa-vault` calls per Mesa session: 0.** Mean: 0.125. Counting only the 7 Mesa sessions with owner-typed messages, 1 of 7 (14%) called `project_context`, no other tool was called, and the median is still 0. Across all 294 conversations, Codex made no `mesa-vault` call at all.

## 4. Vault writes

**Method.** `mesa receipts --json --limit 1000` for each profile (the default and one other), filtered to the window. The receipts were cross-checked against the `save_*` tool calls above and against shell `mesa vault save` commands that exited 0.

| Count | Value |
| --- | --- |
| `save_decision` writes | 1 (via the `mesa vault save decision` shell command, not the tool) |
| `save_summary` writes | 0 |
| `save_note` writes | 1 (via the `mesa vault save note` shell command, not the tool) |
| Other vault changes | 1 project brief update |
| Writes through the `save_*` MCP tools | 0 |
| Mesa sessions that wrote at least one real-profile change | 1 of 16 (6%) |

All three real-profile receipts in the window come from one Mesa session on one day. Three more sessions ran `mesa vault save` against throwaway test profiles, which are not counted. The other profile has no receipts.

## 5. Search speed (for #531)

**Method.** `mesa history search <project> vault --json` was run 5 times with Mesa 0.1.1, the installed CLI, on the owner's largest registered project: 120 of the 294 conversations. Each run was timed wall-clock, end to end, including node start-up. Every run returned `ok: true` and 30 results.

| Runs (s) | Median |
| --- | --- |
| 0.513, 0.515, 0.508, 0.502, 0.506 | **0.508 s** |

## Triggers

Each reopen condition on #529, with what this audit measured. "Met" reads the condition literally. The owner's decision for each trigger is recorded on #555.

| Issue | Trigger on #529 | Measured | Met |
| --- | --- | --- | --- |
| #538 | #555 shows knowledge loss | 1 correction recurred (2 sessions, 2 projects), uncovered when it recurred. 1 multi-step procedure re-learned in 16 sessions, plus 3 single-command usages in 3 to 7 sessions. Mesa sessions: median 0 vault calls. | yes, small |
| #531 | search at 1 s or more | median 0.508 s over 5 runs | no |
| #533 | repeated preference corrections that CLAUDE.md and Claude's memory miss, and #538's oracle passes | 1 such correction (2 sessions); #538 has not run | no (second half not run) |
| #532 | the same procedure re-learned in 3 or more sessions, and a pilot passes | 1 multi-step procedure in 16 sessions (plus 3 single-command usages); no pilot has run | no (first half met, second half not run) |
| #535 | returns only as an injected variant, if real use of the pull tools is shown | 1 of 16 Mesa sessions (1 of 7 with owner messages) called any pull tool, 2 calls in total, median 0 | no |

## Cleanup

The script and its working files lived in a session scratch folder outside the repo and were deleted after this report was written. No transcript, vault note, profile or agent config was changed.
