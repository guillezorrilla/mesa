# ADR-0019: Faro keeps ownership; a local Strands Decider worker answers behind it

Status: accepted
Date: 2026-10-03

## Context

P11 (#458) wants a free decision model for bounded judgments in Mesa supervision and inside managed coding sessions, with no required paid API. Faro (ADR-0004) already owns typed questions, backend selection, validation, rules fallback and decision evidence. The candidate is Strands Decider v19, an Apache-2.0 LoRA adapter and pointer head over Qwen3.5-2B-Base that answers Choice, Score and Noul questions and generates no text. #459 qualified the official CLI on the owner's Mac; the measurements are in `docs/spikes/decision-assistance-feasibility.md`.

## Decision

### Ownership

- Faro stays the owner. The model is a decisions backend named `strands`, next to `rules` and `adapter`. Nothing else talks to the model: sessions, hooks, the CLI and the app go through Faro.
- Deterministic facts stay authoritative. Hooks, the agent listing and process facts outrank any model answer on the board (ADR-0003); a guardrail block, a native permission or a person's override can never be relaxed by model confidence; advice never executes an action, approves a permission, or marks work complete.
- Four first-release decision sites, each owned by `decisions/sites.ts` with its own wording and acceptance threshold: `supervision` (a session whose hooks and listing are silent, read from its screen tail), `relevance` (rank bounded existing project context with source IDs), `next-step` (choose among supplied candidates, with `defer`), and `evidence` (does supplied evidence support a stated completion claim). Each site asks one question shape: a Choice for the first three and a Noul for the fourth.

### Wire contract and mapping

- Faro questions gain optional `instructions` (Choice, Score) and `criteria` (a description per option, level, or Noul `true`/`false`). Rules and the adapter ignore them; answers stay keyed by option name.
- `strandsBackend` posts `{state, model, questions}` to `POST /v1/systemone` with each question's wording, and maps replies to Faro answers: Choice keeps the chosen option, Score's level-index distribution is re-keyed by level name and its expected index divided by `levels - 1` (0 to 1), Noul's `P(true)` is kept as Faro's probability. The wire rounds probabilities to 4 places, so Mesa renormalises them per question before Faro's check (which needs a sum within 1e-6). An answer that is missing, names an option the question does not have, is non-finite or out of range throws, and Faro's rules answer.
- The checkpoint has 24 option slots: a Choice above 24 options is refused upstream (HTTP 422) even though the wire schema allows 255. Sites keep their options at or below 24.
- Confidence fields are not interchangeable across providers (Strands Choice: normalised max; Strands Score: normalised standard deviation; adapter: model-reported; rules: top probability). Mesa's acceptance policy therefore reads one number it computes itself from the probabilities, the margin `(n * max p - 1) / (n - 1)` (for a Noul, `|2p - 1|`). Receipts keep each provider's raw probabilities, its own confidence, the model and checkpoint revision, and the policy result, under their own names.

### Acceptance and abstention

- A site accepts an answer only when its margin reaches the site's threshold (`ACCEPT_AT` in `sites.ts`), fitted on the calibration split only. Below it, Mesa abstains: supervision keeps the rules' state, relevance keeps the original order, next-step and evidence give no advice. Unavailable (no worker, deadline, 4xx/5xx, malformed answer) is reported separately from abstained.
- Score-only questions are never skipped by Faro's existing rules-certainty test: the model path is asked whenever the site is enabled, and its own acceptance applies.

Thresholds fitted on the 15-case calibration split per site (#459, MLX), by one rule: rank the calibration answers by margin, take the largest top set whose accuracy meets the site's quality gate, and use its lowest margin, never below 0.5, truncated to 3 decimals. Fifteen cases per site is small; the held-out run, not this fit, decides whether a site ships.

| Site | `ACCEPT_AT` margin |
| --- | --- |
| supervision | 0.663 |
| relevance | 0.5 |
| next-step | 0.721 |
| evidence | 0.766 |

### Runtime, worker and transport

- Nothing ships in the app or the release. The owner decided on 2026-10-03 that the app must stay small: the model (about 4.4 GB) and its Python runtime (about 0.8 GB) are an explicit, opt-in local install (`mesa decisions install`, Settings > Decisions), showing size and resources first. Until then decision assistance is off and rules answer, with no download, ever, from a hook or session.
- Pinned artifacts: strands-decider at git `6d5dec6bd9c36fb63317803363a92ebcfcdfd207` with its `mlx` extra, Python 3.12, torch 2.7.1, transformers 5.17.0, peft 0.21.0, mlx 0.32.3, mlx-lm 0.32.0; checkpoint `StrandsAgents/strands-decider-2B-hobson-v19` at revision `bb282d786bc251fd4e3068de3ada9ddbb38127cd` (verified by its own `MANIFEST.sha256`); base `Qwen/Qwen3.5-2B-Base` at revision `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`, the revision v19's `provenance.json` records. Upstream's loader does not pin the base, so Mesa installs a local checkpoint view whose `hobson_config.json` names the pinned local base folder and runs with `HF_HUB_OFFLINE=1`. Every file is checksummed at install; a mismatch never activates.
- Artifacts are machine-wide, outside every profile, vault and repo: `~/Library/Application Support/Mesa/decisions/<runtime id>/`. Profiles share the files, not the process.
- Device: `--device mlx` (opt-in upstream; about 1.8x faster than MPS on the target Mac with matching answers). CPU and MPS are not offered.
- One worker per active profile: a Mesa-owned supervisor process that starts the official `strands-decider serve <checkpoint view> --device mlx --strict-window --port <random> --model-name strands-decider-2B-hobson-v19` bound to 127.0.0.1, and is the only client of it. Callers reach the supervisor over a profile-local Unix socket (mode 0600). The supervisor serialises every request (upstream documents a shared-offset race, #9; the 1/4/8-client probe saw no drift, which does not prove safety), bounds the queue (8 waiting), the input (the strict 4096-token window, plus Mesa's per-site caps) and each request's deadline, drops queued requests whose caller gave up, stops the server after 15 idle minutes, restarts it at most 3 times in 10 minutes, and rechecks health after a clock jump (sleep/wake). An abandoned in-flight request still occupies the engine until it finishes (measured), so deadlines bound the caller, not the engine.
- Residual risk, accepted: the upstream server has no authentication, so another process of the same macOS user could reach its loopback port directly. It holds no secrets and answers only typed questions.

### Delivery into sessions

- Automatic advice is delivered only at native events the #459 probe proved (see the provider matrix in the feasibility report), with a fixed packet budget and a hard deadline; on a miss, abstention or slow worker, the turn proceeds with no advice. Session start uses the existing pointer (ADR-0010). Per-turn delivery uses Claude Code's and Codex's `UserPromptSubmit` `additionalContext`, and Antigravity's `PreInvocation` ephemeral message, re-sent unchanged on every invocation of the same turn because a packet sent before a tool call was not kept. Mesa's own packet deadline (1,500 ms) stays well under the native hook timeout, because a native timeout blocks the whole turn for its full length and then drops the context with little or no notice.
- On-demand use is the `decision_evaluate` MCP tool served by `mesa decisions mcp` (stdio, bound per request through the existing session binding owner), and `mesa decisions evaluate|context|advise --json` for the CLI.
- Routine evaluations are ephemeral: no receipt, no vault note, no log of prompts. Only an explicit, meaningful decision goes through the existing `faro.decide` receipt path.

### Hosted endpoints

Optional and explicit only (#464): a user's own endpoint or Hugging Face ZeroGPU Space, credentials in Keychain, no Mesa relay, no silent fallback from local to remote or from free to paid. ZeroGPU currently supports Gradio only and PyTorch 2.8 or later, so the Space template needs its own qualified stack; PRO accounts are billed automatically past the daily quota, which Mesa must state before enabling.

## Frozen gates

These numbers are fixed before the held-out evaluation (#465) and are not lowered afterwards. A site that misses any of them ships off (or experimental, opt-in per session), with its measured result shown.

**Quality (held-out split, per site, `QUALITY_GATES` in `decisions/evaluation.ts`).** A site may be automatic only if its accepted answers are at least this accurate, it accepts at least this share of cases, and it gets strictly more cases right and accepted than the rules baseline. The baseline's answers stand whenever they are not even, as the board acts on its rules today (held-out: supervision 16 accepted, 10 right; the other sites have no rules and accept nothing).

| Site | Selective accuracy | Coverage |
| --- | --- | --- |
| supervision | >= 0.90 | >= 0.40 |
| relevance | >= 0.80 | >= 0.50 |
| next-step | >= 0.85 | >= 0.40 |
| evidence | >= 0.90 | >= 0.40 |

**Latency (target Mac, MLX, warm worker).** An automatic per-turn packet is at most 1,024 tokens and has a hard deadline of 1,500 ms including queue time; its measured p95 added turn latency over 20 turns is at most 1,500 ms and p50 at most 700 ms. An on-demand call has a 10 s deadline.

**Resources.** Worker physical footprint at most 6.5 GB while loaded and 0 after idle stop; installed disk at most 6 GB; cold start to ready at most 30 s.

**Concurrency and safety.** With 8 concurrent sessions, every request either answers within its deadline or is reported unavailable; no answer is delivered to a session, profile or model other than the one that asked; zero cross-session cache hits.

**Paired workflows (#465).** At least 6 invented coding tasks, each run with assistance off and on, same main model and setup, order randomised, 2 repetitions per arm (24 runs or more). Assistance passes only if task success with it is at least as high as without, median wall time is no more than 10% worse, and at least one of these improves: success (+1 task or more) or median wall time (10% or more faster). Faster inference or more decision calls alone does not pass.

## Evidence

`docs/spikes/decision-assistance-feasibility.md`: hardware (Apple M1 Pro, 10 cores, 32 GB, macOS 26.6.2), install, offline inference, MPS and MLX latency by input size, 1/4/8 clients, strict-window refusal, cancellation, crash, memory and disk, the provider delivery probe, hosted-path facts, and the calibration-split results with the rules baseline.

## Consequences

- Mesa owns a small HTTP client, a supervisor and a site policy; it adds no Python to the app bundle.
- The first answers on supervision were weak on uncalibrated wording; quality may fail its gates on some sites, which then stay off. That is an acceptable outcome of this design, not a reason to lower a gate.
- Upgrading the checkpoint, base or runtime is a new runtime id: a new install, a new calibration run and new held-out evidence before it may be automatic.
