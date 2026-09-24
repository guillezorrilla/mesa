# TypeSafe / Jev / System One LLM adapter - existence and shape verification

Research date: 2026-09-24. All access dates below are 2026-09-24 unless noted.

## Verdict

**Found, and real as of the access date.** TypeSafe AI is a company that came out of stealth on 2026-09-15 with a $40M seed round (reported as led by DCVC) and shipped "Jev," a "System One" decisions model, into early access on that date (hosted API access opened 2026-09-21 per OpenRouter). This is very recent (9 days old at research time), so treat every detail here as subject to change, and treat third-party commentary as still-settling.

Caveat on method: some facts below came through `WebFetch`, which converts a page to Markdown and then has a small model summarize it against my prompt - that summarization step can itself introduce small errors (e.g., exact star counts, "who forked whom"). I weighted `npm view`/`npm search` and raw GitHub search-result listings more heavily than prose summaries because those come back as structured registry/search data rather than LLM paraphrase. Where a fact only ever came from one WebFetch summary, I've flagged it as unconfirmed.

## Queries run and results

### Web search (step 1)

| Query | Result |
|---|---|
| `"TypeSafe" "Jev" decisions API` | Hit. Found typesafe.ai, OpenRouter docs, Pydantic AI docs, LangChain blog, MarkTechPost, a dedicated `jevmodel.org` site. Consistent description: TypeSafe's "System One" model, typed decisions with probabilities, primitives Choice/Score/Noul. |
| `"Jev API" decisions early access` | Hit. Confirms early access, waitlist, launch date 2026-09-15, $40M seed led by DCVC, and third-party access paths (OpenRouter, Vercel AI Gateway, Netlify AI Gateway, AIMLAPI, a reseller site `tokenra.io`). |
| `typesafe.ai` | Hit. Company overview: founded 2024, CEO Diogo Almeida (ex-OpenAI, RLHF/InstructGPT), CTO Erik Gafni, COO Sasha Sheng. Coverage from The Register, InfoWorld, Tom's Hardware. |
| `typesafe.dev jev` | Hit (no separate typesafe.dev found; results point back to typesafe.ai and third parties: Cloudflare AI docs, Pydantic docs, a GitHub gist writeup). |
| `gettypesafe jev` | Hit (no literal "gettypesafe" domain found; results are the same typesafe.ai / TypeSafe AI ecosystem). |
| `"Noul" "Choice" "Score" primitive TypeSafe Jev` | Hit. Multiple independent explainer sites (dev.to, jevpatterns.com, learnjev.com, Sanity glossary, a GitHub repo `HermeticOrmus/jev-primitives`) converge on the same field definitions for the three primitives (details below). |
| `"System One LLM adapter" github typesafe` | Hit. Confirms `typesafe-ai/system-one-adapter-python` as the vendor's own adapter repo, plus multiple independent forks/ports (Rust, other Python forks, a JS package), and a GitHub issue in an unrelated project (`Oaklight/llm-rosetta`) proposing to add Jev as a converter target - third-party organic adoption signal. |

Not run as separate literal queries but effectively covered by the above: "Jev decisions", "typesafe jev early access" (covered by the early-access query), "Noul primitive" / "Noul Choice Score" (covered), "TypeSafe System One" (covered by company/product queries).

### Package registries and GitHub search (step 2)

| Query | Result |
|---|---|
| `npm search typesafe jev` | Hit. Real, independently-published npm packages referencing TypeSafe Jev by name, all dated within the last few days: `jev-kit` (CLI), `jevcore-mcp` (MCP server, Apache-2.0), `@tanstack/ai-typesafe` (TanStack's own AI package, published by TanStack's verified GitHub Actions OIDC publisher, dated 2026-09-24), `@mlola/decision-jev`. |
| `npm view @typesafe/jev` | 404 - not found under that scoped name. |
| `npm view jev` | Found, but it's an unrelated abandoned package (`jev@0.0.0`, published "over a year ago," no relation to TypeSafe). |
| `npm view typesafe` | 404 - unpublished. |
| `npm view system-one` | Found: `system-one@0.1.1`, "Typed decisions across System-1 models, with Promise and Effect-native clients," keywords include `jev`, `typesafe`, `typescript`; published 5 days ago by an independent maintainer (lukeramsden). Third-party, not the official SDK. |
| `npm search "system one" adapter` | Hit: `system-one-adapter@0.5.0` - "Drop-in TypeSafeClient replacement backed by LLM APIs," MIT, published by GitHub Actions (OIDC) from `SynthLuvr/system-one-adapter-js`, 15 hours old at query time, depends on `@anthropic-ai/sdk ^0.127.0`, `@typesafe-ai/sdk ^0.6.0`, `openai ^7.20.0`, `arktype ^2.2.3`. |
| `npm view @typesafe-ai/sdk` | Found: `@typesafe-ai/sdk@0.6.0`, "TypeScript SDK for the TypeSafe API," MIT, maintainers `diogo149`/`alliesafe` at `@typesafe.ai` addresses, published a week ago via GitHub Actions OIDC. This looks like the genuine official TypeScript client for calling Jev itself (not an LLM-backed adapter). |
| `pip index versions typesafe-jev` | No pip on PATH initially; via `python3 -m pip`: no matching distribution - not found under that exact name. |
| `python3 -m pip index versions system-one-adapter` | Found: versions 0.2.1, 0.2.0, 0.1.5, 0.1.4, 0.1.3 - a PyPI package by this name exists and is actively versioned. |
| `python3 -m pip index versions system-one` | Found: versions 0.2.0, 0.1.0. |
| GitHub search `"system one" adapter typesafe` (via WebFetch of the search URL) | Returned real repo listings: `BetterZflyee/dsh-jev-adapter` (JS, 2 stars), `codeitlikemiley/system-one-adapter-rust` (Rust, 0 stars), `cogcloud-ai/cog-system-one-adapter` (Python, 0 stars, updated 10 hours before query), `Hejk/jev-feed-guard` (JS Chrome extension, 0 stars). All independent third-party projects, not TypeSafe's own. |
| `github.com/typesafe-ai` org page | Lists `system-one-adapter-python` (Python, MIT, described by TypeSafe's own blog as their reference LLM wrapper), `typesafe-sdk-python`, `typesafe-sdk-js` (matches the `@typesafe-ai/sdk` npm package), `skills`, and some unrelated forks (`vllm`, `LLaDA`). Star counts reported by WebFetch summarization (289 / 234 / 220 / 2080) are **unconfirmed** - treat as approximate, not verified against the raw page. |

## What Jev is (from typesafe.ai and docs.typesafe.ai)

- Company: TypeSafe AI, "an AI lab building machine-native intelligence infrastructure for automation." Docs: https://docs.typesafe.ai/. Console/sign-in: https://console.typesafe.ai/. Contact: hello@typesafe.ai. (Source: https://typesafe.ai/, accessed 2026-09-24.)
- Jev is TypeSafe's first "System One Model": you send it `state` plus one or more typed `questions`; it returns typed answers with probabilities and confidence in a single parallel pass (reported latency 70–500ms), rather than generating text.
- Training/architecture claim: "Reinforcement Learning for Calibrated Decisions (RLCD)" (their term, not RLHF). (Source: typesafe.ai homepage.)

### The three primitives (converged across typesafe.ai docs, OpenRouter docs, and multiple independent explainers)

- **Choice** - picks one option from a caller-defined set (up to 255 options). Returns the selected option, a probability per option, and a confidence value.
- **Score** - rates state against an ordered rubric of 2–10 caller-defined levels. Returns a probability-weighted position (can fall between levels), a probability per level, and a confidence value.
- **Noul** - a yes/no proposition. Returns a single calibrated probability (0–1) that the answer is yes. No separate confidence field - the probability itself is the certainty measure.

### Request/response shape (from https://docs.typesafe.ai/api.md, accessed 2026-09-24 via WebFetch - treat exact field names as best-effort, not verbatim-verified)

- Base URL: `https://api.typesafe.ai`
- Endpoint: `POST /v1/systemone`
- Auth: `Authorization: Bearer <API_KEY>`
- Request shape (paraphrased):
  ```json
  {
    "state": "string | object | array",
    "model": "jev-latest",
    "questions": {
      "<question_id>": {
        "type": "noul | choice | score",
        "instructions": "string | object | array",
        "criteria": "type-dependent (Noul: optional true/false descriptions; Choice: map of option -> description, max 255; Score: ordered array of 2-10 level descriptions)"
      }
    }
  }
  ```
- Response shape (paraphrased):
  ```json
  {
    "model": "string",
    "answers": {
      "<question_id>": {
        "type": "noul | choice | score",
        "noul": "number (0-1, noul only)",
        "choice": "string (choice only)",
        "score": "number (score only)",
        "probabilities": "map of option/level -> float",
        "confidence": "number (0-1, choice/score only)"
      }
    },
    "usage": { "input_tokens": "integer", "output_tokens": "integer" }
  }
  ```
- Error codes documented: 401 (bad key), 422 (validation), 429 (rate limited, backoff), 529 (overloaded). No specific numeric rate limits or a pricing table were present in the fetched doc pages.

### Pricing and access

- Pricing (consistent across typesafe.ai homepage, TypeSafe's own launch blog post, and OpenRouter's Jev docs): **$0.042 per 1M input tokens ($42 per billion), output tokens free** ("too cheap to meter"). Source: https://typesafe.ai/ and https://typesafe.ai/blog/introducing-system-one-models-and-jev, both accessed 2026-09-24.
- Early access: waitlisted directly via TypeSafe's own console (https://console.typesafe.ai/); also reachable without a direct TypeSafe key through third-party gateways - OpenRouter (`POST https://openrouter.ai/api/alpha/decisions`, model id `typesafe/jev-1.13` or `typesafe/jev-latest`, billed via a normal OpenRouter API key), Vercel AI Gateway, Netlify AI Gateway, AIMLAPI, and a third-party reseller `tokenra.io`. I have **not** independently verified the reseller (`tokenra.io`) beyond a single search snippet - treat that path as unverified and lower-trust.
- I did not attempt to obtain an actual API key (out of scope, would require account creation).

## The "System One LLM adapter" (open source)

- **Official, vendor-published:** `typesafe-ai/system-one-adapter-python` on GitHub. Language: Python. License: MIT. Purpose per its own description: "A drop-in replacement for `typesafe_sdk`'s `system_one` evaluation API, backed by LLM APIs instead of TypeSafe" - i.e., it implements the same Choice/Score/Noul request/response contract but calls out to a real LLM provider instead of TypeSafe's model, for cost/speed/quality comparison. Exported types per the README (WebFetch summary, not verbatim-verified): `SystemOneAdapterClient` / `AsyncSystemOneAdapterClient`, `SystemOneResponse`, `Noul`/`Score`/`Choice`, `Message`. **Supported providers: OpenAI, Anthropic (explicitly including Claude Haiku), Google Gemini.** Also confirmed live on PyPI as `system-one-adapter` (versions up to 0.2.1). Star count and exact last-commit date could not be reliably confirmed (WebFetch summary said "289 stars" / "6 commits," unconfirmed).
- **There is no official TypeScript/JavaScript adapter from TypeSafe itself.** What exists in TypeScript is:
  - `@typesafe-ai/sdk` (npm, official per maintainer identity `diogo149`/`allie@typesafe.ai`, MIT) - this is the official **client SDK for calling Jev/TypeSafe's own API**, not an LLM-backed adapter.
  - `system-one-adapter` (npm, MIT) by third-party maintainer `SynthLuvr` (repo `SynthLuvr/system-one-adapter-js`) - an **unofficial** TypeScript port of the same adapter pattern, depending on `@anthropic-ai/sdk`, `openai`, `@typesafe-ai/sdk`, and `arktype`. Very new (published roughly 15 hours before this research; 0.5.0). WebFetch's repo summary called it both "forked from typesafe-ai/system-one-adapter-python" and described it as a distinct package - I could not fully resolve that inconsistency and flag it as unconfirmed provenance.
  - Several other small, low-adoption community packages reference Jev by name (`jev-kit`, `jevcore-mcp`, `@mlola/decision-jev`, `system-one` by an unrelated maintainer, a Rust port, a couple of tiny GitHub repos with 0-2 stars). None of these are TypeSafe-official.

## Anthropic Claude Haiku (fallback path)

- Structured outputs / strict tool use doc: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (accessed 2026-09-24). Confirms Claude Haiku 4.5 (model id `claude-haiku-4-5-20251001`) supports structured outputs (`output_config.format` for JSON-schema-constrained responses) and strict tool use (`tools[].strict: true`).
- Official pricing page: https://platform.claude.com/docs/en/about-claude/pricing (accessed 2026-09-24). Claude Haiku 4.5: **$1 / MTok input, $5 / MTok output** (base rate); batch: $0.50 / $2.50 per MTok; 5m cache write $1.25/MTok, 1h cache write $2/MTok, cache hit $0.10/MTok. (Public marketing page at https://www.anthropic.com/pricing 301-redirects to https://claude.com/pricing; I fetched the docs mirror above instead of following that redirect a second time, but the docs page states it mirrors claude.com/pricing.)

## Recommendation for Mesa's decisions layer

Per the plan's own decision rule:

**(a) applies only if** an official-quality TypeScript adapter with a compatible license exists. It does not, cleanly: TypeSafe's own open-source "System One LLM adapter" is Python-only. The only TypeScript option is a third-party, single-maintainer package published within the last day, with unresolved provenance and no track record. I do not recommend taking `system-one-adapter` (npm, SynthLuvr) as a direct Mesa dependency yet - it's too new, unofficial, and unverified to trust in a production decisions path, even though its license (MIT) and shape would otherwise qualify.

**Recommendation: go with (b).** Define Mesa's own small interface, e.g. `decide(state, questions) -> answers`, with `Choice`, `Score`, and an open-answer primitive (mirroring Noul's yes/no-with-probability shape, or a freer-form primitive if Mesa needs one beyond yes/no). Implement:
- a **rules backend** (deterministic, no LLM),
- an **LLM backend** calling Anthropic's Messages API with structured output against `claude-haiku-4-5-20251001`, using either `output_config.format` (JSON schema) or `tools[].strict: true`, per https://platform.claude.com/docs/en/build-with-claude/structured-outputs. Current Haiku 4.5 pricing: $1/MTok in, $5/MTok out (https://platform.claude.com/docs/en/about-claude/pricing, accessed 2026-09-24),
- a **`jev` backend slot** that stays a stub: TypeSafe's own API requires a waitlisted key Mesa doesn't have yet, the request/response shape documented above is a WebFetch paraphrase (not hand-verified against a raw HTTP call), and the product is 9 days old with no operational track record. Revisit once Mesa has an actual key and can hit `https://api.typesafe.ai/v1/systemone` (or the OpenRouter alpha Decisions API) directly to confirm the shape byte-for-byte, and once/if TypeSafe or a trustworthy maintainer ships a TypeScript adapter with real adoption.

## Open questions

- Exact numeric rate limits for the Jev API (not published in any fetched page).
- Whether `console.typesafe.ai` early access is instant or genuinely gated by a waitlist queue - sources disagree slightly (TypeSafe's own site implies console-based access; a search snippet claimed a third-party reseller `tokenra.io` gives immediate keys, unverified).
- True star counts / last-commit dates for `typesafe-ai/system-one-adapter-python` and the org's other repos (only available via WebFetch summarization, not independently reconfirmed).
- Whether `SynthLuvr/system-one-adapter-js` is a genuine fork of the official Python adapter or an independent reimplementation (WebFetch gave contradictory signals).
- No raw/authenticated HTTP call to `api.typesafe.ai` was made (would require an API key, out of scope here) - the request/response shape above should be treated as "best current documentation," not verified wire format.

blocked_on: null
