# Faro: decisions

`decide(deps, state, questions)` asks questions about a state and returns one answer per question, each with probabilities and a confidence. The primitives are exactly Jev's (ADR-0004). Callers see only the shapes in `types.ts`, never a backend's wire format.

- `types.ts`: the questions (`Choice`, `Score`, `Noul`), `Answer`, `Decision`, `Backend`, and `DecisionRecorder`.
- `rules.ts`: `rulesBackend(rules, fallback)`, deterministic and always available. The first rule whose `when(state)` holds weighs the questions by id. The backend normalises the weights, so probabilities always sum to 1.
- `decide.ts`: `decide` validates the questions, and the site's rules answer first. The backend the profile names (`decisions.backend`) is asked only when the least sure answer is below `decisions.threshold` (ADR-0003). That backend must be available at this site, and `jev` also needs a `jev` key. Its answers stand only when they parse and fit the questions; otherwise the rules' answers stand. Rules that throw give even answers. The Decision then goes to `deps.recorder`, and a failed record never fails the decision.

Every decision site brings its own rules backend; the adapter backend (#26) is shared. `mesa decide` asks from the command line: questions no rules know, so the answers are even.

## Choice: pick one of 2 to 255 options

```ts
const route = rulesBackend<{ text: string }>([
  { when: (s) => s.text.startsWith('http'), answer: () => ({ route: { ingest: 9, ask: 1 } }) },
]);
await decide({ backends: [route], config, clock }, { text: 'https://example.com/post' }, [
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
await decide({ backends: [urgency], config, clock }, { waitingMinutes: 15 }, [
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
await decide({ backends: [destructive], config, clock }, { prompt: 'git push --force' }, [
  { kind: 'Noul', id: 'destructive', statement: 'The prompt destroys work' },
]);
// answers: [{ id: 'destructive', kind: 'Noul', answer: true, probabilities: 0.93 }]
```
