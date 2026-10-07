# Faro: decisions

`decide(deps, state, questions)` asks questions about a state and returns one answer per question, each with probabilities and a confidence. The primitives are exactly Jev's (ADR-0004). Callers see only the shapes in `types.ts`, never a backend's wire format.

- `types.ts`: the questions (`Choice`, `Score`, `Noul`), `Answer`, `Decision`, `Backend`, and `DecisionRecorder`.
- `rules.ts`: `rulesBackend(rules, fallback)`, deterministic and always available. The first rule whose `when(state)` holds weighs the questions by id. The backend normalises the weights, so probabilities always sum to 1.
- `decide.ts`: `decide` validates the questions, and the site's rules answer first. The model the profile chose (`decisions.model`: `jev`, `clef` or `none`, the default) is asked only when the least sure answer is below `decisions.threshold` (ADR-0003). That model must be available at this site. Its answers stand only when they parse and fit the questions; otherwise the rules' answers stand as `rules-fallback`, with the reason. Rules that throw give even answers. The Decision, with the model id that answered, then goes to `deps.recorder`, and a failed record never fails the decision.
- `keys.ts` and `models.ts`: the models' keys, a TypeSafe key (Jev) or a Cloudflare API token (CLEF), kept only in the Keychain (service `mesa-<profile>-decisions`, accounts `typesafe` and `cloudflare`, each item the key and when it was added) and listed by their last 4 characters; the Cloudflare account ID is in `config.yaml` as `decisions.cloudflareAccount`. A key is saved only after one call with an invented question answers. The first key selects its model, `mesa decisions use` picks between two, and removing the chosen model's key moves to the other model if it has a key, else to `none`. `active` is the chosen model as a backend that reads its key when asked. There is no fallback from one provider to the other. An old `decisions.backend` (only ever `rules`, or the removed adapter) loads and is ignored.

- `guardrail.ts`: the decision site in front of an external action (CONTEXT.md, Guardrail). `checkGuardrail` asks a Choice (`verdict`: allow, ask, block) and a Noul (`secret-or-destructive`) of its own rules over the patterns in `guardrail-patterns.ts` and the project's `guardrail` level; `passGuardrail` applies `yes`, `force`, and a person's `confirm`, or throws `guardrail_blocked`. Every rules answer is 0.95 sure, since a match or a level is a fact the rules read. The rules are its only backend: no model ever sees a text before it is sent.

- `systemone.ts`: `systemOneBackend`, the one client for Jev (TypeSafe) and CLEF (Cloudflare Workers AI), which answer the same System One wire format (ADR-0019, 2026-10-05 amendment). A small per-provider table holds the URL, auth, pinned model id (`SYSTEM_ONE_MODELS`) and list price; CLEF's REST envelope is unwrapped. It sends each question's optional `instructions` and `criteria`, maps Score indices to 0-1, renormalises the wire's rounded probabilities, and returns the answers with the responding model id, input tokens and cost. An HTTP error, `success: false`, the deadline, an unreachable host, or a missing or off-question answer throws a MesaError naming the provider, never the key. Tests replay `fixtures/systemone/{jev,clef}/`, recorded live on invented content.
- `sites.ts`: the four decision sites (supervision, relevance, next-step, evidence), their wording, and when an answer is accepted: its margin `(n * max p - 1) / (n - 1)` reaches `ACCEPT_AT[model][site]`, fitted per model on the calibration split.
- Decision assistance for sessions (CONTEXT.md, Decision assistance and Scoped context; #462): `packet.ts` builds each site's state, capped at 4,096 characters, in the shape the sites were qualified on; `evaluate.ts` asks Faro (`faro.ask`, recorded nowhere) within the per-turn or on-demand deadline and reads the answer as accepted, abstained or unavailable, automatic only at a site in `PASSED_GATE`; `context.ts` is the relevance site over the session's own project; `advice.ts` holds the fixed sentences around an answer; `request.ts` is the one request shape the CLI and the `decision_evaluate` tool share; `scope.ts` binds a call to one live session through the Vault server's binding; `session-decisions.ts` keeps a session's off switch, recent use and ready answers outside the vault; `server.ts` is `mesa decisions mcp`; `service.ts` wires them for a profile.
- `evaluation/`: `corpus.ts`, `corpus/` and `evaluation.ts`, the invented evaluation corpus and its scorer. `pnpm decisions:evaluate --backend rules|jev|clef [--model clef|clef-flash] --dataset calibration|heldout [--json]` prints per-site coverage, selective accuracy, calibration, latency, input tokens and dollars per 1,000 calls, and whether each site meets its frozen gate (ADR-0019); on calibration it also prints the thresholds `fitAcceptAt` fits. The rules baseline needs nothing; `jev` reads `TYPESAFE_API_KEY`, `clef` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Every decision site brings its own rules backend. `mesa decide` asks from the command line: questions no rules know, so the rules' answers are even, and the chosen model, if any, is always asked, within the on-demand deadline (10 s, ADR-0019). With `model: none`, no model is asked and nothing goes over the network.

ADR-0020 removed the adapter, a headless Claude Code or Codex call that answered when the rules were unsure: it made every Board read wait 13 to 19 s and turned right answers wrong (`docs/spikes/faro-value.md`). A profile that still names it acts as `rules`.

In the examples, `profile` is Faro's view of the profile (`FaroProfile`: its `decisions` settings), which `createFaro` (`faro.ts`) builds for each profile, and `clock` is the injected clock.

## Choice: pick one of 2 to 255 options

```ts
const route = rulesBackend<{ text: string }>([
  { when: (s) => s.text.startsWith('http'), answer: () => ({ route: { ingest: 9, ask: 1 } }) },
]);
await decide({ backends: [route], profile, clock }, { text: 'https://example.com/post' }, [
  { kind: 'Choice', id: 'route', options: ['ingest', 'ask'] },
]);
// answers: [{ id: 'route', kind: 'Choice', answer: 'ingest',
//             probabilities: { ingest: 0.9, ask: 0.1 }, confidence: 0.9 }]
```

## Score: a position on an ordered rubric of 2 to 10 levels

The answer is the probability-weighted position, from 0 (the first level) to 1 (the last).

```ts
const urgency = rulesBackend<{ waitingMinutes: number }>([
  { when: (s) => s.waitingMinutes > 10, answer: () => ({ urgency: { medium: 1, high: 3 } }) },
]);
await decide({ backends: [urgency], profile, clock }, { waitingMinutes: 15 }, [
  { kind: 'Score', id: 'urgency', levels: ['low', 'medium', 'high'] },
]);
// answers: [{ id: 'urgency', kind: 'Score', answer: 0.875,
//             probabilities: { low: 0, medium: 0.25, high: 0.75 }, confidence: 0.75 }]
```

## Noul: one calibrated probability that a statement holds

A Noul has no separate confidence. Its answer is `true` above 0.5.

```ts
const destructive = rulesBackend<{ prompt: string }>([
  { when: (s) => /rm -rf|--force/.test(s.prompt), answer: () => ({ destructive: 0.93 }) },
]);
await decide({ backends: [destructive], profile, clock }, { prompt: 'git push --force' }, [
  { kind: 'Noul', id: 'destructive', statement: 'The prompt destroys work' },
]);
// answers: [{ id: 'destructive', kind: 'Noul', answer: true, probabilities: 0.93 }]
```
