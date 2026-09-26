import { expect, test } from 'vitest';
import { seededRandom } from '../testing/index.js';
import { rulesBackend, toAnswer, type Weights } from './rules.js';
import type { Question } from './types.js';

const choice: Question = { kind: 'Choice', id: 'route', options: ['ingest', 'ask', 'ignore'] };
const score: Question = { kind: 'Score', id: 'urgency', levels: ['low', 'medium', 'high'] };
const noul: Question = { kind: 'Noul', id: 'destructive', statement: 'The prompt deletes files' };

test('toAnswer normalises weights: the likeliest option, the weighted position, one probability', () => {
  expect(toAnswer(choice, { ingest: 1, ask: 3 })).toEqual({
    id: 'route',
    kind: 'Choice',
    answer: 'ask',
    probabilities: { ingest: 0.25, ask: 0.75, ignore: 0 },
    confidence: 0.75,
  });
  expect(toAnswer(score, { medium: 1, high: 1 })).toEqual({
    id: 'urgency',
    kind: 'Score',
    answer: 0.75,
    probabilities: { low: 0, medium: 0.5, high: 0.5 },
    confidence: 0.5,
  });
  expect(toAnswer(noul, 0.93)).toEqual({
    id: 'destructive',
    kind: 'Noul',
    answer: true,
    probabilities: 0.93,
  });
  // No usable weight is even; an out-of-range Noul is clamped.
  expect(toAnswer(choice, { ingest: -1, ask: Number.NaN, constructor: 5 })).toMatchObject({
    answer: 'ingest',
    confidence: 1 / 3,
  });
  expect(toAnswer(score, undefined)).toMatchObject({ answer: 0.5 });
  expect(toAnswer(noul, 7)).toMatchObject({ answer: true, probabilities: 1 });
  expect(toAnswer(noul, Number.NEGATIVE_INFINITY)).toMatchObject({ probabilities: 0 });
  // Huge weights do not overflow the total.
  expect(toAnswer(choice, { ingest: 1.5e308, ask: 1.5e308 }).probabilities).toEqual({
    ingest: 0.5,
    ask: 0.5,
    ignore: 0,
  });
  expect(toAnswer(noul, undefined)).toMatchObject({ answer: false, probabilities: 0.5 });
});

test('the first rule that holds weighs its questions, over the fallback, else even', async () => {
  type State = { idleMinutes: number };
  const backend = rulesBackend<State>(
    [
      { when: (s) => s.idleMinutes > 30, answer: () => ({ urgency: { high: 1 } }) },
      { when: (s) => s.idleMinutes > 5, answer: () => ({ urgency: { medium: 1 } }) },
    ],
    () => ({ urgency: { low: 1 }, destructive: 0.1 }),
  );
  const urgency = async (idleMinutes: number) =>
    (await backend.answer({ idleMinutes }, [score, noul])).map((a) => a.answer);
  expect(await urgency(45)).toEqual([1, false]);
  expect(await urgency(10)).toEqual([0.5, false]);
  expect(await urgency(0)).toEqual([0, false]);
  expect(backend.name).toBe('rules');
  expect((await rulesBackend([]).answer(null, [choice]))[0]).toMatchObject({ answer: 'ingest' });
});

test('property: every Choice and Score answer has probabilities summing to 1 within 1e-6', async () => {
  const random = seededRandom(24);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)] as T;
  const weights = [0, 0, -3, 1e-12, 1, 7, 1e9, 1.5e308, Number.NaN, Number.POSITIVE_INFINITY];
  for (let run = 0; run < 500; run++) {
    const count = 2 + Math.floor(random() * (random() < 0.5 ? 9 : 254));
    const names = Array.from({ length: count }, (_, i) => `n${i}`);
    const question: Question =
      count <= 10 && random() < 0.5
        ? { kind: 'Score', id: 'q', levels: names }
        : { kind: 'Choice', id: 'q', options: names };
    const w: Weights = Object.fromEntries(
      names
        .filter(() => random() < 0.7)
        .map((n) => [n, random() < 0.5 ? pick(weights) : random() * 100]),
    );
    const [answer] = await rulesBackend([{ when: () => true, answer: () => ({ q: w }) }]).answer(
      null,
      [question],
    );
    if (answer?.kind === 'Noul' || !answer) throw new Error('expected a Choice or Score');
    const total = Object.values(answer.probabilities).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1), `run ${run}`).toBeLessThan(1e-6);
    expect(Object.keys(answer.probabilities)).toHaveLength(count);
    expect(answer.confidence).toBe(Math.max(...Object.values(answer.probabilities)));
  }
});
