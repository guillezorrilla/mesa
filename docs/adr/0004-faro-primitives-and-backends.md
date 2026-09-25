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
