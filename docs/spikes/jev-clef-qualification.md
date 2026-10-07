# Jev and CLEF qualification (#638)

Date: 2026-10-05 to 2026-10-06. Mac: Apple M1 Pro, macOS 26.6.2, home broadband. Corpus: #459's invented corpus, unchanged (`packages/core/src/decisions/evaluation/corpus/`): 15 calibration and 30 held-out cases per site, held-out families disjoint from calibration. Only that invented content was sent.

## Verdict

Every decision site passes ADR-0019's frozen quality gate for both models on the held-out split: `jev-1.13.0` and `clef` (27B). Both beat the rules baseline on every site, and both meet the hosted latency gate (p95 at most 1,500 ms for a packet of at most 1,024 input tokens) by a wide margin. `PASSED_GATE` in `decisions/sites.ts` lists all four sites for both models.

Caveat: 30 held-out cases per site is small, and the corpus is invented. A 100% selective accuracy on 26 to 30 accepted cases has a 95% Wilson lower bound of about 87% to 89%, so the paired workflows in #465 still decide whether a site ships automatically.

## Method

1. One client, `systemOneBackend` (`decisions/systemone.ts`), for both providers. Fixtures recorded live on invented content: `fixtures/systemone/jev/three-kinds.json` and `fixtures/systemone/clef/three-kinds.json`. The first live CLEF call confirmed Cloudflare's envelope `{ result, success, errors, messages }`. A rejected token answers HTTP 401 with `success: false` and "Authentication error".
2. Calibration only, per model: `pnpm decisions:evaluate --backend jev|clef [--model clef|clef-flash] --dataset calibration --json`. The thresholds came from `fitAcceptAt`, ADR-0019's rule.
3. CLEF size chosen on calibration, before any held-out run (below).
4. `ACCEPT_AT` for both models committed in 91c6cd8e. The held-out split had not been run at that point.
5. Held-out run once per model, after that commit: `pnpm decisions:evaluate --backend jev --dataset heldout --json` and `--backend clef`.

Keys came from temporary Keychain items through the environment (`TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and were never printed.

## Calibration (15 cases per site) and the CLEF size

| Model | supervision | relevance | next-step | evidence | p95 latency (worst site) | $ per 1,000 calls |
| --- | --- | --- | --- | --- | --- | --- |
| jev-1.13.0 | 93.3% | 93.3% | 86.6% | 93.3% | 216 ms | 0.023 to 0.034 |
| clef-flash (9B) | 93.3% | 86.6% | 66.6% | 86.6% | 260 ms | 0.035 to 0.052 |
| clef (27B) | 100% | 86.6% | 93.3% | 93.3% | 568 ms | 0.092 to 0.140 |

Accuracy is over all answers, before thresholds. **CLEF ships as `clef` (27B).** On calibration it is as accurate as clef-flash or better on every site, and much better on next-step (93.3% against 66.6%). It costs about 2.7 times as much (still about $0.10 per 1,000 calls), and its p95 is well inside the 1,500 ms deadline. Cloudflare's free 10,000 Neurons a day cover roughly 450k clef input tokens, about 1,200 calls at this corpus's size. `SYSTEM_ONE_MODELS` pins `jev-1.13.0` and `clef`.

Fitted thresholds (`ACCEPT_AT`, margin):

| Model | supervision | relevance | next-step | evidence |
| --- | --- | --- | --- | --- |
| jev | 0.568 | 0.5 | 0.5 | 0.5 |
| clef | 0.762 | 0.5 | 0.684 | 0.509 |

## Held-out (30 cases per site, run once per model)

Rules baseline (what the Board does with no model): supervision accepts 16, of which 10 are right; the other sites have no rules and accept nothing.

| Model | Site | n | Coverage | Selective accuracy | Right and accepted (rules) | Gate | p50 / p95, packets of at most 1,024 tokens | Mean / max input tokens | $ per 1,000 calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jev | supervision | 30 | 86.7% | 100% | 26 (10) | pass | 101 / 149 ms (29) | 697 / 1,724 | 0.029 |
| jev | relevance | 30 | 93.3% | 100% | 28 (0) | pass | 78 / 139 ms (30) | 526 / 985 | 0.022 |
| jev | next-step | 30 | 96.7% | 100% | 29 (0) | pass | 74 / 168 ms (29) | 524 / 2,254 | 0.022 |
| jev | evidence | 30 | 86.7% | 100% | 26 (0) | pass | 86 / 173 ms (29) | 463 / 1,748 | 0.019 |
| clef | supervision | 30 | 100% | 100% | 30 (10) | pass | 318 / 521 ms (29) | 466 / 1,477 | 0.112 |
| clef | relevance | 30 | 90.0% | 100% | 27 (0) | pass | 306 / 547 ms (30) | 350 / 822 | 0.084 |
| clef | next-step | 30 | 96.7% | 100% | 29 (0) | pass | 322 / 582 ms (29) | 348 / 1,997 | 0.084 |
| clef | evidence | 30 | 86.7% | 96.2% | 25 (0) | pass | 302 / 487 ms (29) | 297 / 1,562 | 0.071 |

Gates (frozen, unchanged): supervision 90% selective accuracy and 40% coverage, relevance 80% and 50%, next-step 85% and 40%, evidence 90% and 40%. Each site must also have more cases right and accepted than the rules. Latency is measured from the Mac, one call at a time, with a 60 s quality-run deadline; no call came close to the 1,500 ms per-turn deadline. The packet column counts the cases with at most 1,024 input tokens, shown in brackets. Token counts differ by provider because each one counts its own prompt.

## Every failure

No call failed: 0 unavailable on either run (no HTTP error, timeout or malformed answer). Wrong answers:

| Model | Case | Tags | Expected | Answered | Margin | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| jev | sup-h-015 | non-english | waiting-question | idle | 0.508 | no |
| jev | sup-h-023 | option-order | done | idle | 0.424 | no |
| jev | sup-h-025 | non-english | done | idle | 0.543 | no |
| jev | rel-h-023 | ambiguous | none | note:wiki/decisions/sandbox-v2.md | 0.2 | no |
| jev | nxt-h-026 | clear | defer | force-push-rewrite | 0.25 | no |
| jev | evi-h-002 | clear | false | true | 0.3 | no |
| jev | evi-h-005 | adversarial | false | true | 0.02 | no |
| jev | evi-h-008 | option-order | false | true | 0.48 | no |
| clef | rel-h-023 | ambiguous | none | note:wiki/decisions/sandbox-v2.md | 0.286 | no |
| clef | nxt-h-026 | clear | defer | force-push-rewrite | 0.361 | no |
| clef | evi-h-002 | clear | false | true | 0.802 | **yes** |
| clef | evi-h-008 | option-order | false | true | 0.477 | no |
| clef | evi-h-017 | injection | true | false | 0.265 | no |

Every Jev miss fell below its threshold, so Mesa abstained. CLEF accepted one wrong evidence answer (evi-h-002, a completion claim that the evidence did not support). Both models picked `force-push-rewrite` over `defer` on nxt-h-026, though neither was sure enough for Mesa to accept it. Both lean towards "supported" on unsupported evidence. Mesa keeps evidence advice advisory: it never marks work complete (ADR-0019).

## Cost of this qualification

Jev: about 104k input tokens over calibration and held-out, about $0.004 at $0.042 per M (output is free). CLEF: within the free daily Neurons.
