# ADR-0020: Faro answers with its rules alone; the claude -p adapter is removed

Status: accepted
Date: 2026-10-03

## Context

ADR-0003 and ADR-0004 put an `adapter` backend behind Faro's rules: when the least sure rules answer was below `decisions.threshold` (0.7 by default), Faro ran `claude -p --model haiku` (or `codex exec` with `decisions.adapter: codex`) and waited up to 20 s for its answer. `adapter` was the default `decisions.backend`.

#487 measured it on the owner's Mac against a throwaway profile (`docs/spikes/faro-value.md`):

- **Slower.** With Mesa's hooks installed every row is sure and the adapter is never called. One unsure row makes every adapter-on Board read wait for it: `mesa sessions --json` p50 13.2 s and p95 19.2 s instead of about 0.6 s. That covers `mesa sessions`, `board`, `show`, `search`, PR-event delivery, the automations tick, and the `mesa sessions --json` and `mesa show` calls the shipped skills make inside sessions. A working unsure session cost 144 adapter calls an hour with the app open. 24% of the calls hit the 20 s timeout and changed nothing.
- **Less accurate.** On the 65 Board-reachable cases where it was asked, rules alone were right 61 times and rules plus adapter 52 times. It changed 17 answers and only 4 of the changes were right; on live Claude panes all 9 of its changes were wrong. Its only gains were on `done` and `failed` screens, which the Board takes from process facts instead.
- **Unreachable where it might matter most.** The guardrail's rules are 0.95 sure of every answer, so the adapter was never asked before a send at the default threshold (0 calls in 80 sends).
- **Unrecorded.** The Board site wrote no Decision, so nothing kept the adapter's latency, cost or fallbacks.

The owner, 2026-10-03: if it is not proven, drop it for now. With no key, bypass the decisions and let the AI work normally.

## Decision

- The `adapter` backend is removed: `decisions/adapter.ts`, its Codex isolation (`decisions/codex.ts`), their tests and recorded fixtures. Nothing in Mesa runs `claude -p` or `codex exec` for a decision.
- `DECISIONS_BACKENDS` is `['rules']` and `decisions.backend` defaults to `rules`. A `config.yaml` that still says `backend: adapter`, or has `decisions.adapter`, loads and acts as `rules`; no profile file needs editing. `decisions.threshold` stays, for the backend that comes next.
- `classifySession` and the guardrail ask only their own rules. The rules' reading is a session's state, sure or not. A session record whose `lastState.source` is `adapter` (with its `basis` hash) still loads, and the next look that reads a signal replaces it.
- `mesa sessions --no-adapter` and the app's second "adapter look" beside the Board's look are removed, since every look is now the quick one. The app bundles its own `mesa`, so nothing else passes the flag.
- `mesa decide` answers with rules (even answers for questions no rules know). `mesa doctor` reports decisions as `rules only` and probes no model. Settings no longer offers a backend, an adapter agent or a threshold.
- Receipts and queued automation runs written before this keep `backend: adapter`, and still read.
- Faro's `Backend` seam and the named-backend step in `decide` stay. Hosted models (#488) come back through them, and only after ADR-0019's held-out supervision gate, running beside the Board read rather than inside it.
- The guardrail stays rules only: no model sees a prompt before it is sent.

This supersedes the adapter parts of ADR-0003 ("The adapter backend is consulted only when the rules backend's confidence is below a profile-configured threshold") and of ADR-0004 (the `adapter` backend, its "runs on Claude Code headless", "as built (#26)" and "Codex adapter (#160)" amendments, and the adapter paragraph of "the guardrail as built (#31)"). Faro's primitives, its rules, its receipts and the threshold check stay as those ADRs say.

## Evidence

`docs/spikes/faro-value.md` (#487), measured 2026-10-03 on Mesa 0.1.1 (`d45d921`) with Claude Code 2.1.288: latency tables for `mesa sessions --json`, the app's Board loop and `mesa send`; accuracy on 23 repo fixtures, 40 live pane captures and 45 invented corpus cases; aggregates from the owner's real profiles (0 of 2 recorded states came from the adapter).

## Consequences

- No Board read, CLI command or agent tool call waits on a model. A profile with no decision key works as the agents do on their own.
- A session no hook and no listing speaks for is read from its screen alone, at 0.6. The spike's fix for those rows is installing Mesa's hooks, not a model.
- `Decision.costUsd` and the receipt's `cost` stay for a backend that reports a price; no decision fills them today.
- A hosted model that returns must record its latency, cost and fallbacks at the Board site, which today records nothing.

Note 2026-10-05: `mesa board` was removed in #599.
