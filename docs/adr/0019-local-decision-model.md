# ADR-0019: Faro keeps ownership; Strands Decider answers behind it, in the user's own Space or locally

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

### Where the model runs: the user's own Space first, local optional

The owner decided on 2026-10-03, after the pilot below: the default path is the user's own Hugging Face Space, connected by pasting one Hugging Face token; the local runtime is optional and Mesa says plainly, before anything starts, that it downloads about 5 GB. Every setup surface is one clear step with plain words, in the CLI and the app alike (Settings > Decisions).

- **Own Space (default).** The user pastes a Hugging Face token once (stdin or a protected field, stored in the Keychain owner, masked everywhere). Mesa creates a private Space in the user's account from the pinned template in this repository (`deploy/decision-space/`), uploaded with the user's own token (it needs write access; Mesa says why), on ZeroGPU, and talks to it directly over the documented Gradio call API: no Mesa relay, no shared key. Free ZeroGPU hosting needs an account in good standing older than 30 days with a verified email (at most 2 such Spaces); callers have 5 GPU minutes a day on a free account; the Space sleeps when idle. Mesa states these limits, and that PRO accounts are billed past their daily quota, before it creates anything, and shows waking, queued, quota-exhausted and unauthorized states. Session content then goes to the user's own Space; Mesa says so. ZeroGPU supports Gradio only and PyTorch 2.8 or later, so the template is qualified on its own pinned stack (#464).
- **Local (optional).** The pinned runtime below, installed only when the user asks.
- **Off.** Without either, rules answer, as today.
- Never a silent fallback from one path to another, from free to paid, or a model download from a hook or session. OpenRouter was considered and rejected: its free tier serves generic chat models (20 requests a minute, 50 a day without bought credits), not a typed decision model.

### Local runtime, worker and transport

- Nothing ships in the app or the release. The owner decided on 2026-10-03 that the app must stay small: the model (about 4.4 GB) and its Python runtime (about 0.8 GB) are an explicit, opt-in local install (`mesa decisions install`, Settings > Decisions), showing size and resources first. Until then decision assistance is off and rules answer, with no download, ever, from a hook or session.
- Pinned artifacts: strands-decider at git `6d5dec6bd9c36fb63317803363a92ebcfcdfd207` with its `mlx` extra, Python 3.12, torch 2.7.1, transformers 5.17.0, peft 0.21.0, mlx 0.32.3, mlx-lm 0.32.0; checkpoint `StrandsAgents/strands-decider-2B-hobson-v19` at revision `bb282d786bc251fd4e3068de3ada9ddbb38127cd` (verified by its own `MANIFEST.sha256`); base `Qwen/Qwen3.5-2B-Base` at revision `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`, the revision v19's `provenance.json` records. Upstream's loader does not pin the base, so Mesa installs a local checkpoint view whose `hobson_config.json` names the pinned local base folder and runs with `HF_HUB_OFFLINE=1`. Every file is checksummed at install; a mismatch never activates.
- Artifacts are machine-wide, outside every profile, vault and repo: `~/Library/Application Support/Mesa/decisions/<runtime id>/`. Profiles share the files, not the process.
- Device: `--device mlx` (opt-in upstream; about 1.8x faster than MPS on the target Mac with matching answers). CPU and MPS are not offered.
- One worker per active profile: a Mesa-owned supervisor process that starts the official `strands-decider serve <checkpoint view> --device mlx --strict-window --port <random> --model-name strands-decider-2B-hobson-v19` bound to 127.0.0.1, and is the only client of it. Callers reach the supervisor over a profile-local Unix socket (mode 0600). The supervisor serialises every request (upstream documents a shared-offset race, #9; the 1/4/8-client probe saw no drift, which does not prove safety), bounds the queue (8 waiting), the input (the strict 4096-token window, plus Mesa's per-site caps) and each request's deadline, drops queued requests whose caller gave up, stops the server after 15 idle minutes, restarts it at most 3 times in 10 minutes, and rechecks health after a clock jump (sleep/wake). An abandoned in-flight request still occupies the engine until it finishes (measured), so deadlines bound the caller, not the engine.
- Residual risk, accepted: the upstream server has no authentication, so another process of the same macOS user could reach its loopback port directly. It holds no secrets and answers only typed questions.

### Delivery into sessions

- Decisions never block a turn. The pilot showed a synchronous per-turn call on a loaded Mac timing out every time (the 5 GB model was paged out between turns; a cold call took 1.6 to 2.1 s). Mesa asks for advice in the background: for the saved goal while the coding CLI starts (it knows the goal at launch), and for later turns as soon as an event allows. The turn's hook only reads a ready answer for exactly that prompt and session, and otherwise sends nothing.
- Automatic advice is delivered only at native events the #459 probe proved (see the provider matrix in the feasibility report), with a fixed packet budget and a hard deadline; on a miss, abstention or slow worker, the turn proceeds with no advice. Session start uses the existing pointer (ADR-0010). Per-turn delivery uses Claude Code's and Codex's `UserPromptSubmit` `additionalContext`, and Antigravity's `PreInvocation` ephemeral message, re-sent unchanged on every invocation of the same turn because a packet sent before a tool call was not kept. Mesa's own packet deadline (1,500 ms) stays well under the native hook timeout, because a native timeout blocks the whole turn for its full length and then drops the context with little or no notice.
- On-demand use is the `decision_evaluate` MCP tool served by `mesa decisions mcp` (stdio, bound per request through the existing session binding owner), and `mesa decisions evaluate|context|advise --json` for the CLI.
- Routine evaluations are ephemeral: no receipt, no vault note, no log of prompts. Only an explicit, meaningful decision goes through the existing `faro.decide` receipt path.

## Frozen gates

These numbers are fixed before the held-out evaluation (#465) and are not lowered afterwards. A site that misses any of them ships off (or experimental, opt-in per session), with its measured result shown.

**Quality (held-out split, per site, `QUALITY_GATES` in `decisions/evaluation/evaluation.ts`).** A site may be automatic only if its accepted answers are at least this accurate, it accepts at least this share of cases, and it gets strictly more cases right and accepted than the rules baseline. The baseline's answers stand whenever they are not even, as the board acts on its rules today (held-out: supervision 16 accepted, 10 right; the other sites have no rules and accept nothing).

| Site | Selective accuracy | Coverage |
| --- | --- | --- |
| supervision | >= 0.90 | >= 0.40 |
| relevance | >= 0.80 | >= 0.50 |
| next-step | >= 0.85 | >= 0.40 |
| evidence | >= 0.90 | >= 0.40 |

**Latency (target Mac, MLX, warm worker).** An automatic per-turn packet is at most 1,024 tokens and has a hard deadline of 1,500 ms including queue time (3,000 ms since the 2026-10-08 amendment below); its measured p95 added turn latency over 20 turns is at most 1,500 ms and p50 at most 700 ms. An on-demand call has a 10 s deadline.

**Resources.** Worker physical footprint at most 6.5 GB while loaded and 0 after idle stop; installed disk at most 6 GB; cold start to ready at most 30 s.

**Concurrency and safety.** With 8 concurrent sessions, every request either answers within its deadline or is reported unavailable; no answer is delivered to a session, profile or model other than the one that asked; zero cross-session cache hits.

**Paired workflows (#465).** At least 6 invented coding tasks, each run with assistance off and on, same main model and setup, order randomised, 2 repetitions per arm (24 runs or more). Assistance passes only if task success with it is at least as high as without, its time per successful task (the arm's total wall time divided by its successful runs; unbounded with none) is no more than 10% worse, and at least one of these improves: success (+1 task or more) or time per successful task (10% or more lower). Faster inference or more decision calls alone does not pass.

Owner revision, 2026-10-03, before any final evaluation: the paired gate first read "median wall time no more than 10% worse". The pilot showed that measuring raw time rewards finishing fast and wrong: with the right note injected, success went from 0/12 to 10/12 while median wall time rose from 10.6 s to 15.9 s. The owner chose time per successful task instead. No other gate changed.

## Evidence

`docs/spikes/decision-assistance-feasibility.md`: the paired pilot, hardware (Apple M1 Pro, 10 cores, 32 GB, macOS 26.6.2), install, offline inference, MPS and MLX latency by input size, 1/4/8 clients, strict-window refusal, cancellation, crash, memory and disk, the provider delivery probe, hosted-path facts, and the calibration-split results with the rules baseline.

## Consequences

- Mesa owns a small HTTP client, a supervisor and a site policy; it adds no Python to the app bundle.
- The first answers on supervision were weak on uncalibrated wording; quality may fail its gates on some sites, which then stay off. That is an acceptable outcome of this design, not a reason to lower a gate.
- Upgrading the checkpoint, base or runtime is a new runtime id: a new install, a new calibration run and new held-out evidence before it may be automatic.

## Amendment, 2026-10-03: API only, and the user picks the model

The owner decided after #487: "no local model downloaded locally, that will make the app very slow, just using API for decisions models".
- The local runtime above (the worker, the supervisor, `mesa decisions install` and MLX) is withdrawn. #460 is closed as not planned.
- Strands Decider runs only through a hosted Space or Endpoint that the user owns.
- The person chooses Jev (a TypeSafe key), CLEF (a Cloudflare key), Strands (a Hugging Face key) or none, and none is the default. Each key is kept only in the Keychain and shown once (#488).
- With no key, rules answer and no model is asked.

#487 (`docs/spikes/faro-value.md`) measured the `claude -p` adapter that ADR-0003 and ADR-0004 placed behind the rules on the Board.
- It is slower: the Board waits 13 to 19 s whenever it is asked.
- It is less accurate: rules alone were right 61 of 65 times, rules plus adapter 52 of 65.
- So it is dropped as the default. Any hosted model must pass this ADR's held-out supervision gate, and must run beside the Board read rather than inside it, before it may place a session.

## Amendment, 2026-10-05: Jev and CLEF through one System One client

The owner dropped Strands Decider on 2026-10-05: no Hugging Face Space, no Hugging Face key, no local runtime (#464 and #460 closed). Mesa asks only Jev (TypeSafe) and CLEF (Cloudflare Workers AI), whichever the person has a key for (#488).

- **One client.** Jev and CLEF answer the same System One request and answer shapes, which are Faro's primitives. `decisions/systemone.ts` (`systemOneBackend`) serves both over `lib/http.ts`, with no SDK. A small per-provider table holds what differs: the URL, the bearer key (a TypeSafe key, or a Cloudflare API token plus account ID), the pinned `model` id (`SYSTEM_ONE_MODELS`) and Cloudflare's `{ success, result, errors }` envelope. The wire mapping above (Score indices to 0-1, renormalised probabilities, Noul P(true), and a throw on a missing or off-question answer) is unchanged. HTTP errors, `success: false`, the deadline and an unreachable host each throw a MesaError naming the provider and never the key, and Faro's rules answer. There is no fallback from one provider to the other.
- **Thresholds per model.** `ACCEPT_AT` is keyed by model (`jev`, `clef`), each fitted on the calibration split by the rule above (`fitAcceptAt` in `decisions/evaluation/`) and committed before that model's held-out run. A new model id means a new calibration and a new held-out run.
- **Latency gate, hosted.** The hosted latency gate is the 1,500 ms per-turn deadline, measured from the Mac at p95 for a packet of at most 1,024 input tokens. The MLX warm-worker p50 bound is withdrawn with the worker.
- **Withdrawn.** The local worker and supervisor, the resource gates (footprint, disk, cold start), MLX and the pinned Strands artifacts no longer apply. The Hugging Face Space path of the 2026-10-03 decision is withdrawn too.
- **Unchanged.** The quality gates and the paired-workflow gate (with the owner's time-per-successful-task revision) stand as frozen above. The concurrency and safety gate stands for hosted calls.

Evidence: `docs/spikes/jev-clef-qualification.md` (#638).

## Amendment, 2026-10-07: automatic only after both gates, and the experimental opt-in (#465)

- **Both gates.** A site runs automatically only when the model passed the quality gate there (`PASSED_GATE`, #638) and the paired-workflow gate (`PAIRED_PASSED`, #465), one rule in `decisions/site-mode.ts` (`siteMode`); `PASSED_GATE` is in `decisions/sites.ts`, and `PAIRED_PASSED` is read from the measured arms in `decisions/measured.ts`, which also holds the numbers behind both, shown beside each site's mode in Settings, the session details and `mesa decisions status`. Until a model passes the paired gate, the in-session sites run on demand and Board supervision is off. The paired workflows exercise only the automatic in-session delivery, relevance advice at `UserPromptSubmit`; whether supervision on the Board may count that result is the owner's call when `PAIRED_PASSED` is filled.
- **Experimental opt-in, per profile.** "Experimental, opt-in per session" above becomes one profile setting, `decisions.experimental` (Settings > Smarter decisions > Experimental): automatic decisions at the sites that passed the quality gate but not yet the paired one, each answer marked experimental. A session's own switch cannot come first for a skill run, whose first prompt reaches the hook as it starts, or for Board supervision, which belongs to no session; the paired harness needs automatic delivery to measure it at all. A site that missed the quality gate is never automatic. A person turns any one session off as before (`mesa decisions off`).
- **Gates unchanged.** No number above changed.

## Amendment, 2026-10-08: the per-turn deadline is 3,000 ms

The owner raised the hard per-turn deadline from 1,500 ms to 3,000 ms, after reading the evidence below. This is the one frozen gate changed, and only the owner can change one. `PER_TURN_MS` is 3,000. It now bounds the whole turn hook, from its process start to its exit; the work ends `TURN_EXIT_MS` (200 ms) early so printing and exiting fit inside it. The 1,500 ms figure stays as a monitored target for the hook's added time at p95 (`TURN_TARGET_P95_MS`), which `pnpm decisions:concurrency` checks. Board placement's call shares the deadline; it runs beside the Board read and blocks nothing.

Evidence (`docs/spikes/decision-assistance-evaluation.md`):
- The hook delays the start of a turn that already takes seconds. Paired tasks took 15 to 50 s each, and a Sonnet-class model takes about a second just to start answering.
- Nielsen's response-time limits: 1 s keeps a person's flow and 10 s keeps their attention.
- Claude Code caps a `UserPromptSubmit` hook at 30 s and drops its context on timeout. Mesa installs no shorter limit, and the #459 probe saw hooks killed at a configured 5 s, so 3,000 ms stays well under every native limit.
- Most answers arrive in 0.2 to 0.9 s, so a longer deadline changes only the slow tail. At 1,500 ms that tail lost advice: both Codex `sort-shipments` runs with CLEF were cancelled at the deadline and failed, while every advised run succeeded. Two Claude hooks also overran 1,500 ms by 71 and 107 ms before `TURN_EXIT_MS` existed.

## Amendment, 2026-10-08: Board supervision measured on its own paired workflows (#677)

The 2026-10-07 amendment left open whether Board supervision could count the relevance result. It does not: supervision got its own paired workflows, `pnpm decisions:paired --site supervision`, under the same frozen gate (`pairedVerdict`, unchanged). Six invented Codex tasks each stop once for a person (three questions, three permission prompts), with Codex's hooks silent, since Claude Code's listing always says a session's state and supervision never runs for it; a simulated person acts only on the Board's waiting states. CLEF passed (8 of 12 solved against 6 of 12 by the rules alone, 188.1 s against 336.2 s per solved task), so `PAIRED_ARMS` holds its arms under `supervision` and placement is automatic for CLEF by default. The gain is all in the questions, which the rules read as a finished turn; on the permission prompts, which the rules read right, the arms tie. Jev is not measured and stays off without the opt-in. Evidence: `docs/spikes/decision-assistance-evaluation.md`, Board placement. No gate changed.

Note 2026-10-10: the experimental opt-in is in Settings > Advanced (Try unproven automatic decisions), not Smarter decisions (#728).
