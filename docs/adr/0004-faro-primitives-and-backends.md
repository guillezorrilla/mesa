# ADR-0004: Faro uses Jev's primitives behind Mesa's own interface, with an in-house adapter

Status: accepted
Date: 2026-09-24

## Context

The proposal named three decision primitives (Choice, Score, Noul) from TypeSafe Jev, an "adapter" backend built on TypeSafe's open-source System One LLM adapter running Claude Haiku, and a "jev" backend calling the Jev API. Research (docs/research/sources/typesafe-jev.md) found TypeSafe AI and Jev are real and in early access since 2026-09-15. The primitives are confirmed: Choice picks one of up to 255 options and returns per-option probabilities plus a confidence; Score returns a probability-weighted position on an ordered rubric of 2 to 10 levels plus per-level probabilities and a confidence; Noul returns a single calibrated yes-or-no probability with no separate confidence. Jev generates no text. The official adapter is Python only (system-one-adapter-python, MIT). The only npm port is a one-day-old single-maintainer package with unclear provenance.

## Decision

- Faro's primitives are exactly Jev's: `Choice`, `Score`, `Noul`. There is no open-answer primitive. Free-text routing is a `Choice` over known routes plus a `Noul` for "none of these".
- `decide(state, questions)` is Mesa's own TypeScript interface in packages/core/src/decisions. Backends implement it; callers never see a backend's wire format.
- `rules` backend: deterministic, always available, used in tests and as the fallback when no key or network is present.
- `adapter` backend: written in-house against Anthropic's Messages API with structured outputs (JSON schema per question set) on claude-haiku-4-5-20251001. It returns the same answer shape as `jev`. No dependency on the Python adapter or the community TypeScript port. Revisit when TypeSafe ships an official TypeScript adapter.
- `jev` backend: POST https://api.typesafe.ai/v1/systemone with a bearer key. It is a typed stub with a contract test against the documented shape until a key exists; the P3 spike makes the first real call and corrects the shape if needed. OpenRouter lists `typesafe/jev-1.13` as a second access path.
- Redaction: `jev` and `adapter` receive structured fields plus a redacted output tail (secrets and paths under the home directory masked), never a raw transcript. The rules backend receives the same input, so the redaction is tested once.
- Every decision writes its probabilities and confidence into the calling action's receipt.

## Evidence

docs/research/sources/typesafe-jev.md (typesafe.ai, docs.typesafe.ai, npm and PyPI registry data, accessed 2026-09-24). Anthropic structured outputs and pricing pages accessed 2026-09-24: Haiku 4.5 is 1 USD per million input tokens and 5 USD per million output tokens; Jev is 0.042 USD per million input tokens with free output.

## Consequences

- The plan's "adapter backend" survives with a different implementation and no new dependency.
- Jev's wire format is documented but not yet verified by a live call; the contract test can be wrong until the spike runs.
- Noul has no separate confidence, so the receipt schema records confidence as optional per answer.

## Amendment 2026-09-24: the adapter backend runs on Claude Code headless

The owner will not add an Anthropic API key; Mesa runs on the Claude and Codex subscriptions only. The `adapter` backend therefore does not call the Messages API. It runs `claude -p` with `--output-format json` and `--json-schema` (both present in Claude Code 2.1.281), `--model haiku`, tool use disabled, a 20 second timeout, and falls back to `rules` on any error. The answer shape is unchanged. Fixtures are recorded locally with the real `claude -p` and replayed in tests through a fake runner. `total_cost_usd` from the result is recorded for information only. Jev stays opt-in: it is a paid API (0.042 USD per million input tokens) and is used only when the owner adds a key. When Codex lands (v1 is Claude-only, see ADR-0003 amendment), `codex exec --output-schema` becomes a second subscription-backed adapter.

## Amendment 2026-09-25: the interface as built (#24)

- A `Score` answer is the probability-weighted position on its rubric, normalised to 0 for the first level through 1 for the last. That way one scale serves every rubric length, and the attention score (0 to 1) can be read from a Score directly. The `jev` backend maps Jev's position onto this scale when it lands. Receipts store the normalised number.
- A decision site passes its own rules backend. Rules answer first, as ADR-0003 says. The backend the profile names is asked only when the least sure answer is below `decisions.threshold`. For a Noul, "sure" means how far its probability leans from 0.5. The named backend's answers are parsed and checked against the questions, and if they do not fit, the rules' answers stand.

## Amendment 2026-09-25: the adapter as built (#26)

- The call is `claude -p <prompt> --output-format json --json-schema <schema> --model haiku --tools ""`, as amended above, plus two flags:
  - `--no-session-persistence`, so decisions leave nothing in the owner's session history;
  - `--strict-mcp-config` (with no `--mcp-config`), so no MCP server starts for a decision.
- The call reads `structured_output` and `total_cost_usd` from the result.
- A recorded call took 4 to 13 s, so the 20 s timeout can bite under load. That is one reason the adapter is asked only when the rules are unsure.
- When the named backend was asked and failed, the Decision says `rules-fallback`. The receipt schema's `backend` (rules, adapter, jev) gains it when P3 writes decisions into receipts.
- Fixtures hold the exact argv and the verbatim result, so a changed prompt or schema fails the replay until someone records again.
- A Noul is asked as a boolean with a confidence, and Mesa turns the pair into the probability that the statement holds. A first recording asked for a bare "probability" next to the boolean, and the model read it as its confidence in "no".
- On the board:
  - Attention always comes from the rules' bands (ADR-0003), applied to the adapter's state. The adapter's own Score stays in the Decision, so a wait still outranks work.
  - The adapter's confidence is kept as it comes. The tail's 0.6 cap is on the rules' reading of the screen, not on the adapter's.
  - The board refreshes every few seconds, so the adapter's answer is saved with a hash of what it saw, and it is not asked again until that changes.
  - Foreign sessions have no record to keep that hash, so they use rules only.

## Amendment 2026-09-26: Jev dropped (#154)

The owner dropped Jev on 2026-09-26, and P3 leaves it out: the issues for the Jev spike (#34) and the `jev` backend (#35) were deleted. `decisions.backend` is `rules` or `adapter`, and a config that names `jev` is `invalid_config`. Faro keeps `Choice`, `Score`, and `Noul`, which are Mesa's own primitives now. What this ADR says above about the `jev` backend (its endpoint, its key and price, its Score mapping, and `jev` in the receipt schema's `backend`) no longer applies.

## Amendment 2026-09-26: the guardrail as built (#31)

- **The site.** `decisions/guardrail.ts` asks one Choice (`verdict`: allow, ask, block) and one Noul (`secret-or-destructive`) of its own rules. The rules block a text that matches a secret pattern, a destructive pattern (`decisions/guardrail-patterns.ts`), or one of the profile's key values. They ask when the project is `guardrail: strict`, or when its level cannot be read, and allow otherwise.
- **The probabilities.** Every rules answer is 0.95, and the Noul leans 0.95 or 0.05. A match, or a level, is a fact the rules read, so the adapter is asked only when `decisions.threshold` is above 0.95 (the default is 0.7). The 0.05 left over stands for what the rules cannot see: a text that only mentions a command, and a secret or a command no pattern lists. The rules backend normalises weights, which leaves float noise (0.9500000000000001); a receipt keeps each number to 6 decimals (`decisionEntries`), and the Decision stays exact.
- **The adapter.** When asked, it sees the text with every secret masked, so it never passes a key on. Its verdict stands like any adapter answer, and the reason then names it. Building a prompt for it is left for later.
- **The receipt.** `actionRecorder` hands each action a `DecisionRecorder`, and every decision made during the action lands in that action's receipt, as one entry per answer. That includes a failed receipt, and a `blocked` one for `guardrail_blocked`. This closes "every decision writes its probabilities and confidence into the calling action's receipt" above for every site that passes the recorder on. The receipt's `outputs.error` keeps the code and the message; the decision is already in `decisions`.
- **The overrides.** `--yes` passes an ask, `--force` passes a block or an ask, and a person's `y` at a terminal passes an ask; the receipt notes which in `outputs.override`. On `mesa send`, `--force` already passed a pane running a shell and, for a person, an agent waiting on one. One flag now covers every refusal a person may override on a send: a send forced past one check should not be stopped by the next. Another session still cannot force a wait (ADR-0003).
