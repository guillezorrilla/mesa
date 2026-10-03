# Decision assistance feasibility (#459)

Date: 2026-10-03. Owner-authorized spike on the owner's Mac. Only invented content was sent to the model or the providers. No paid model API was called, no hosted endpoint received any data, and no secret was printed. The decisions this report supports are in ADR-0019.

## Verdict

Go for a local, opt-in Strands Decider v19 runtime on MLX behind Faro. The pinned official CLI installs reproducibly, runs offline, answers all three primitives through Mesa's own wire client, refuses overflow under `--strict-window`, and fits the target Mac (5.3 GB footprint, about 10 s cold start, 0.25 to 0.55 s warm for short inputs). Quality is site-dependent: on the calibration split, relevance, supervision and next-step reached their gate accuracy at useful coverage, while evidence sufficiency accepted only 3 of 15 cases. Whether any site ships automatic is decided by the held-out run in #465 against the gates ADR-0019 froze. Laya and the WebGPU conversion were not evaluated: nothing here rejects the primary candidate.

Per the owner (2026-10-03), nothing of this ships inside the app. The model and runtime are an explicit local install the user is prompted for.

## Hardware and software

- Apple M1 Pro, 10 cores, 32 GB, macOS 26.6.2. These numbers are for this machine only.
- uv 0.11.29, Python 3.12.13 venv. torch 2.7.1, transformers 5.17.0, peft 0.21.0, mlx 0.32.3, mlx-lm 0.32.0, huggingface-hub 1.33.0.
- strands-decider from git `6d5dec6bd9c36fb63317803363a92ebcfcdfd207` with the `mlx` extra (PyPI 0.1.0 has no device extras).
- Checkpoint `StrandsAgents/strands-decider-2B-hobson-v19` at `bb282d786bc251fd4e3068de3ada9ddbb38127cd`: its own `MANIFEST.sha256` verified OK. Base `Qwen/Qwen3.5-2B-Base` at `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`, which v19's `provenance.json` records as its training base. Both Apache-2.0 (checkpoint `LICENSE.md` lists the training data sources).
- The upstream loader does not pin the base revision. The spike used a checkpoint view: symlinks to the v19 files plus a `hobson_config.json` whose `base_model` is the local pinned base folder, run with `HF_HUB_OFFLINE=1`.

Install (owner-authorized, into a disposable scratch folder with its own `HF_HOME`; nothing under `~/.cache`):

```sh
uv venv --python 3.12 venv && . venv/bin/activate
uv pip install torch==2.7.1 transformers==5.17.0 peft==0.21.0 \
  "strands-decider[mlx] @ git+https://github.com/strands-labs/strands-decider@6d5dec6bd9c36fb63317803363a92ebcfcdfd207"
python -c 'from huggingface_hub import snapshot_download as s
s("StrandsAgents/strands-decider-2B-hobson-v19", revision="bb282d786bc251fd4e3068de3ada9ddbb38127cd", local_dir="models/v19")
s("Qwen/Qwen3.5-2B-Base", revision="b1485b2fa6dfa1287294f269f5fb618e03d52d7c", local_dir="models/base")'
```

Public downloads needed no token. Disk: base 4.3 GB, checkpoint 88 MB, venv 778 MB (torch 333 MB, mlx 213 MB), plus a 913 MB uv cache that can be removed after install: about 5.2 GB installed.

## Ask and serve

`strands-decider ask <view> --device mps --json` with one Noul, one Choice and one Score over an invented Claude permission prompt answered offline. As a one-shot process it took 39 s wall time (load included) with a 5.2 GB peak footprint, so `ask` is a qualification tool, not a per-call path. Without option descriptions it leaned `working` 0.30 over `waiting-permission` 0.28 (confidence 0.155).

`strands-decider serve <view> --device {mps|mlx} --strict-window --port <p> --model-name strands-decider-2B-hobson-v19`, driven through Mesa's `strandsBackend` (`packages/core/src/decisions/strands.ts`) and Faro's own answer check:

| Measure | MPS | MLX |
| --- | --- | --- |
| Cold start to `/health` ok | 11.7 s | 10.1 s |
| First request after ready | 4.7 s | 2.6 s |
| Warm p50 / p95, ~40-word tail | 443 / 851 ms | 254 / 266 ms |
| ~300 words | 916 / 1,719 ms | 532 / 547 ms |
| ~1,200 words | 2,594 / 3,025 ms | 1,476 / 1,494 ms |
| ~2,800 words | 5,723 / 6,159 ms | 3,159 / 3,259 ms |
| Three primitives on one state | 3,750 ms | 597 ms |
| Physical footprint | not captured (GPU memory outside RSS) | 5,258 MB, peak 5,978 MB |

MPS and MLX gave the same answers to three decimals on the three-primitive request. The recorded MLX reply with Mesa's option descriptions (`decisions/fixtures/strands/three-kinds.json`) chose `waiting-permission` at 0.80 over three options; the Noul "A human is needed now" answered 0.28 on the same permission prompt, a reminder that Noul wording matters and that statements need their own calibration.

- **Strict window.** A 12,574-token state returned HTTP 422 `prompt of 12574 tokens exceeds the context window of 4096 tokens` in 16 ms, recorded in `fixtures/strands/overflow.json`. Mesa's client turns it into an unavailable answer and Faro's rules stand.
- **Option slots.** `/health` reports `num_slots: 24`: a Choice above 24 options is refused upstream although the wire schema allows 255.
- **Probabilities.** The wire rounds to 4 decimals; Mesa renormalises per question (tested) so Faro's 1e-6 sum check holds.
- **Offline.** All runs after download used `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`.

## Concurrency, cancellation, crash

Each of 1, 4 and 8 clients sent 4 distinct requests, first through a client-side serial queue (as Mesa's worker will), then all at once straight at the server.

| Clients | MLX serialized: total p50 / p95, queue p95 | MLX direct: wall, max probability drift vs serial | MPS serialized total p95 |
| --- | --- | --- | --- |
| 1 | 205 / 242 ms, 0 ms | 0.89 s, 0 | 436 ms |
| 4 | 809 / 877 ms, 660 ms | 3.78 s, 0 | 1,719 ms |
| 8 | 1,669 / 1,728 ms, 1,501 ms | 7.34 s, 0 | 3,449 ms |

Direct concurrent requests were slower than serialized ones and drifted by 0 here, which does not prove the upstream shared-offset race (#9) cannot happen; the worker serializes regardless. Queue delay grows linearly with waiting sessions, so per-site deadlines and a bounded queue are required.

- **Cancellation.** A client abort after 50 ms (`TimeoutError`) does not stop the engine: the next request waited 3.4 s on MLX (4.2 s on MPS) for the abandoned ~2,800-word one. Deadlines bound the caller, not the engine; the worker must drop queued work whose caller left and keep inputs small.
- **Crash.** `kill -9` of the server: the next `/health` failed to connect (HTTP 000) immediately, which the client reports as unavailable. A restart costs a cold start (about 10 s).
- **Sleep/wake.** Not tested in this spike: a real sleep of the owner's Mac was out of scope. #460 must recheck health after a clock jump and #465 measures it.
- **Idle cost.** The loaded MLX server holds about 5.3 GB until stopped; ADR-0019 sets an idle stop.

## Native delivery probe

Live probe on 2026-10-03 with an invented project and invented markers only: Claude Code 2.1.288, Codex CLI 0.160.0 and Antigravity CLI 1.2.16, each on its default model. One hook script logged every run (event, stdin hash, timing) and injected a different marker per event and turn; the model was then asked to repeat only the markers it received. Configured means the hook is in the provider's config, executed means the hook ran, delivered means the provider's transcript holds the text, consumed means the answer repeated the marker. Every hook had a 5 s timeout. Each cell was tested once.

| Path | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| Session start | `SessionStart` (`source: startup`): consumed | `SessionStart`: consumed, but it runs at the first prompt, 51 ms before that turn's hook, not at launch | No native event; a first `PreInvocation` for a new `conversationId` can stand in: consumed |
| Each user turn | `UserPromptSubmit` `additionalContext`: consumed on turns 1 and 2 | `UserPromptSubmit` `additionalContext` (a `role: developer` message): consumed on turns 1 and 2 | `PreInvocation` `injectSteps` ephemeral message: consumed on turns 1 and 2 |
| Turn with a tool call | not separately probed | not separately probed | `PreInvocation` fires before every model call; the packet sent before the tool call was delivered but not repeated by the final answer (one sample): the packet must be re-sent on every invocation of the turn |
| Resume | `--resume`, `source: resume`: consumed | `codex resume`, `source: resume`: consumed | `--conversation`: turn packet consumed; the hook cannot tell a resume |
| Headless | `claude -p`: consumed | `codex exec --json`: turn packet consumed | `agy -p`: consumed |
| Plain stdout instead of JSON | consumed (logged as `hook_success`) | consumed | not tested |

- **Added latency.** The hook body took 0 to 3 ms; the providers measured the hook process at 46 to 79 ms (Claude) and 41 to 57 ms (Codex); Antigravity ran each hook about 60 ms in series on every model call, including Mesa's existing inert entry.
- **Timeout.** A hook sleeping past its 5 s timeout was killed at about 5.0 s on every provider: the turn waited the full timeout, the context was dropped, and the turn ran without it. Only the interactive Claude and Codex screens said so; `codex exec --json` and Antigravity showed nothing. Mesa must therefore enforce its own deadline well under the native timeout and return an empty packet itself.
- **Identity in stdin.** Claude: `session_id`, `transcript_path`, `cwd`, `source`, plus `prompt_id` on turns. Codex: `session_id`, `transcript_path`, `cwd`, `source`, `model`, `permission_mode`, plus `turn_id` on turns. Antigravity: `conversationId`, `transcriptPath`, `workspacePaths`, `artifactDirectoryPath`, `modelName`, `invocationNum`, `initialNumSteps`, with no cwd, event name or source. Mesa's existing native-ID checks (ADR-0010) bind each packet.
- **Trust.** Claude runs no hook until its folder trust is accepted. Codex asks for folder trust and then a separate hook review (accepted once, for the two probe hooks only). Antigravity asks for folder trust only and loads hooks with no review, including a project-level `.agents/hooks.json` (in an already trusted folder; untrusted is untested).
- **Not tested:** compact and clear, Antigravity `PostInvocation`, timeouts above 5 s, worktree, handoff and queued launches (P4 proved the pointer on those paths, ADR-0010), and the on-demand MCP tool, which is #463's qualification.
- **Cleanup.** Antigravity's global hooks file was restored byte for byte (SHA-256 `4106c89c...` before and after). The temporary Codex home, its copied login and its background app-server were removed. Neither `~/.codex` nor `~/.claude/settings.json` was written. Folder-trust entries for the invented probe folder remain in `~/.claude.json` and Antigravity's `trustedWorkspaces` until the epic's final cleanup.

## Hosted path (Hugging Face)

Checked against the live documentation on 2026-10-03; no Space was created and no request was sent to any hosted endpoint.

- ZeroGPU hosting is free only for personal accounts in good standing (verified email, account older than 30 days), up to 2 ZeroGPU Spaces; PRO hosts 10. ZeroGPU supports the Gradio SDK only, PyTorch 2.8.0 and later, Python 3.12.12 or 3.10.13; the GPU function needs `@spaces.GPU` (default 60 s duration), and models load onto `cuda` at module level.
- Daily GPU quota: 2 minutes unauthenticated, 5 minutes free account, 40 minutes PRO. An authenticated call spends the caller's quota. PRO, Team and Enterprise users past the included quota are billed automatically against prepaid credits ($1 per 10 minutes), so Mesa must say so before enabling a hosted endpoint and cannot promise "never paid" for such accounts.
- Transport: `POST https://<space>.hf.space/gradio_api/call/<api_name>` with `{"data": [...]}` returns `{"event_id"}`; `GET .../gradio_api/call/<api_name>/<event_id>` streams server-sent events ending in `event: complete`. Private Spaces need `Authorization: Bearer <read token>`. This differs from `/v1/systemone`, so it needs its own client (#464).
- Custom-head compatibility is unverified: the pinned stack uses torch 2.7.1, below ZeroGPU's 2.8.0 floor, and the CUDA path's optional kernels differ from MLX. A Space template must be qualified on its own stack.
- **Blocker.** No Hugging Face account, token or Space was available to this spike, so an authenticated typed request, cold start, queueing and quota behaviour are not qualified. Downloading public weights needed no token; a Hub token alone does not create an endpoint.

## Evaluation corpus and baseline

`packages/core/src/decisions/corpus/` holds 180 invented cases (`calibration.jsonl` 15 per site, `heldout.jsonl` 30 per site), separate scenario families per split, with tags for ambiguity, contradiction, injection, option order, non-English (Spanish, French, German, Japanese), insufficient evidence, long input and adversarial content, and a labeling rationale per case. Held-out labels are 5 per supervision state, 8 of 30 relevance "none", 10 of 30 next-step "defer", 15/15 evidence true/false. Reviewable disputes noted by the author: `rel-h-023`, `rel-c-014`, `rel-h-015`, `sup-h-018`, `sup-h-013`, `evi-h-012`, `evi-h-023`, `evi-c-014`, `nxt-c-002`, `nxt-h-012`, `sup-h-020` (conservative labels in each).

`pnpm decisions:evaluate --backend rules --dataset heldout` (the rules baseline):

| Site | Accepted | Coverage | Selective accuracy | Accuracy |
| --- | --- | --- | --- | --- |
| supervision | 16 | 53.3% | 62.5% | 36.7% |
| relevance | 0 | 0% | - | 33.3% |
| next-step | 0 | 0% | - | 36.7% |
| evidence | 0 | 0% | - | 50.0% |

Supervision's rules read the screen as the board does with no hook or listing (`classify`, tail at 0.6); Claude's reader calls any screen without a busy or menu marker idle, which is why its accepted answers are often wrong. The other sites have no rules and always abstain.

## Calibration split, local model

`pnpm decisions:evaluate --backend strands --dataset calibration` (MLX, after fitting; the held-out split has not been run against the model):

| Site | Accepted | Coverage | Selective accuracy | Accuracy | p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| supervision | 7 | 46.7% | 100% | 73.3% | 368 / 1,989 ms |
| relevance | 14 | 93.3% | 85.7% | 80.0% | 299 / 929 ms |
| next-step | 7 | 46.7% | 85.7% | 60.0% | 260 / 1,285 ms |
| evidence | 3 | 20.0% | 100% | 66.7% | 261 / 1,699 ms |

Rules on the same calibration split: supervision 10 accepted at 80.0%, the rest 0 accepted. The thresholds were fitted on these 15 cases per site by the rule in ADR-0019 (supervision 0.663, relevance 0.5, next-step 0.721, evidence 0.766); the quality gates were written before this run and not changed after it.

## Cleanup

The scratch runtime, model files, uv cache and servers are deleted at the end of the session; the reproducible install above recreates them.
