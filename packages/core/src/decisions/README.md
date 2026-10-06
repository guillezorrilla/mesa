# Faro: decisions

`decide(deps, state, questions)` asks questions about a state and returns one answer per question, each with probabilities and a confidence. The primitives are exactly Jev's (ADR-0004). Callers see only the shapes in `types.ts`, never a backend's wire format.

- `types.ts`: the questions (`Choice`, `Score`, `Noul`), `Answer`, `Decision`, `Backend`, and `DecisionRecorder`.
- `rules.ts`: `rulesBackend(rules, fallback)`, deterministic and always available. The first rule whose `when(state)` holds weighs the questions by id. The backend normalises the weights, so probabilities always sum to 1.
- `decide.ts`: `decide` validates the questions, and the site's rules answer first. The backend the profile names (`decisions.backend`) is asked only when the least sure answer is below `decisions.threshold` (ADR-0003). That backend must be available at this site. Its answers stand only when they parse and fit the questions; otherwise the rules' answers stand as `rules-fallback`. Rules that throw give even answers. The Decision then goes to `deps.recorder`, and a failed record never fails the decision. Today `rules` is the only backend a profile can name (ADR-0020), so the rules always decide; this step is the seam hosted models come back through (#488).

- `guardrail.ts`: the decision site in front of an external action (CONTEXT.md, Guardrail). `checkGuardrail` asks a Choice (`verdict`: allow, ask, block) and a Noul (`secret-or-destructive`) of its own rules over the patterns in `guardrail-patterns.ts` and the project's `guardrail` level; `passGuardrail` applies `yes`, `force`, and a person's `confirm`, or throws `guardrail_blocked`. Every rules answer is 0.95 sure, since a match or a level is a fact the rules read. The rules are its only backend: no model ever sees a text before it is sent.

- `evaluation/strands.ts`: `strandsBackend`, the client for a local `strands-decider serve` (ADR-0019). It sends each question's optional `instructions` and `criteria`, maps Score indices to 0-1, renormalises the wire's rounded probabilities, and throws on a refused (422 strict window), missing or off-question answer. Tests replay `evaluation/fixtures/strands/`, recorded from the pinned server.
- `sites.ts`: the four decision sites (supervision, relevance, next-step, evidence), their wording, and when an answer is accepted: its margin `(n * max p - 1) / (n - 1)` reaches the site's `ACCEPT_AT`, fitted on the calibration split.
- `evaluation/`: `corpus.ts`, `corpus/` and `evaluation.ts`, the invented evaluation corpus and its scorer. `pnpm decisions:evaluate --backend rules|strands --dataset calibration|heldout [--url <server>] [--json]` prints per-site coverage, selective accuracy, calibration and latency, and whether each site meets its frozen gate (ADR-0019). The rules baseline needs nothing; `strands` needs a running server.

Every decision site brings its own rules backend. `mesa decide` asks from the command line: questions no rules know, so the answers are even, and no model is asked.

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
