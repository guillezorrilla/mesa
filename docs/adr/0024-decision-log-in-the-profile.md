# ADR-0024: Faro's decisions are logged in the profile, not as receipts

Status: accepted
Date: 2026-10-13

## Context

Mesa cannot show what Faro did for a person (#778). Board placements live in `placements.json`, which keeps only the last reply per session and drops it when the session no longer wants one; when a placement wins, the rules' own answer for the same screen is never computed; the relevance site keeps the newest 20 uses per session, without the note it advised; and a guardrail stop is a receipt only when kept by the receipt policy. The faro-value spike (#487) found it could not measure Board decisions because none were recorded.

Receipts are the vault's record of meaningful actions, and their volume matters: one unsure Codex run of 30 to 50 s asked the model 15 to 26 times (217 asks over 12 runs, `docs/spikes/decision-assistance-evaluation.md`), and relevance asks once per prompt. A receipt each would bury the vault's receipts and its `log.md`.

## Decision

- Every model ask at the supervision and relevance sites, and every guardrail stop or override, is appended to the profile's Decision log, `~/.mesa/<profile>/decision-log/<YYYY-MM>.jsonl` (`decisions/log.ts`), one JSON line each, mode 0600, by `ctx.decisionLog`.
- A line keeps the site, session, project, the question in plain words, the rules' answer beside the answer that stood, who answered (`rules`, `jev`, `clef`), the status, whether Mesa changed something (`changed`), and the margin, probabilities and latency when known. It never keeps a prompt or a screen: the relevance line names the note it advised; the guardrail line, its reason.
- A placement is logged once, when its reply is saved, not on every Board look; the rules' answer travels with the look's want. Mesa's own vault-capture run passes the guardrail unlogged.
- Appends are best effort and take no lock: one `O_APPEND` write per short line, as the agents' hook event logs. A failed append never fails the decision.
- Receipts are unchanged: what they keep, they still keep.

## Evidence

- `packages/core/src/decisions/log.test.ts`: lines land in their month's file, private; reads filter by since, session and project, newest first, skipping a bad line; an append that cannot be written does not throw.
- `packages/core/src/decisions/supervision.test.ts`: each saved reply is logged once with the rules' answer and `changed` only when an accepted answer differs; an abstention is logged as abstained.
- `packages/core/src/decisions/guardrail.test.ts` and `packages/cli/src/commands/send.test.ts`: a block, an ask declined and an override are logged with their reason, an allow is not, and no prompt text is kept.
- `packages/cli/src/commands/hooks.test.ts`: an automatic relevance ask is logged with the advised note, without the prompt.

## Consequences

- The log grows with use and nothing prunes it yet; at about 200 bytes a line, a busy month is a few megabytes.
- Impact (#780) and anything that later learns from outcomes read this log; a change to its line shape must keep reading old lines, or skip them.

## Amended 2026-10-13: opened notes and marks (#784)

Two more kinds of line, still profile data: `opened`, when an agent reads through the Vault server a note that advice gave its own session in the last 30 days (once per note; a read of any other note records nothing, so vault reads stay unlogged otherwise), and `marked`, a person's Not right on a Moment (`moment` names a log line or a receipt; `mark: null` clears it; the newest stands). A mark line keeps its Moment's site, session, project and decider, and `vault` joins the sites for marks on vault writes.

Evidence: `packages/core/src/vault/mount/tools.test.ts` (opened once, only for the advised session), `packages/core/src/impact/report.test.ts` (opened and not-opened outcomes, a marked Moment out of the summary), `packages/cli/src/commands/impact.test.ts` (mark, undo, unknown id).
