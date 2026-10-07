import { expect, test } from 'vitest';
import { fixedClock, memoryRecorder, steppingClock } from '../testing/index.js';
import { decide, type FaroProfile, selectBackend } from './decide.js';
import { rulesBackend } from './rules.js';
import type { Backend, Question } from './types.js';

type State = { idle: boolean };
const questions: Question[] = [
  { kind: 'Choice', id: 'state', options: ['working', 'idle'] },
  { kind: 'Noul', id: 'stuck', statement: 'The session needs a person' },
];
// Sure when idle; no rule otherwise, so the answers are even (0.5, below the 0.7 threshold).
const rules = rulesBackend<State>([
  { when: (s) => s.idle, answer: () => ({ state: { idle: 1 }, stuck: 0.8 }) },
]);
const profile = (model: FaroProfile['decisions']['model']): FaroProfile => ({
  decisions: { model, threshold: 0.7 },
});
/** The model the profile names, here a stand-in that answers whatever the test gives. */
const MODEL = 'jev';
/** A stand-in for the backend the profile names: answers whatever `answer` gives. */
const fake = (name: Backend['name'], answer: () => Promise<unknown>): Backend<State> => ({
  name,
  answer,
});
const working = async () => [
  {
    id: 'state',
    kind: 'Choice',
    answer: 'working',
    probabilities: { working: 0.9, idle: 0.1 },
    confidence: 0.9,
  },
  { id: 'stuck', kind: 'Noul', answer: false, probabilities: 0.2 },
];

test('decide returns a Decision from the rules backend and records it; a failing record does not fail it', async () => {
  const recorder = memoryRecorder();
  const deps = { backends: [rules], profile: profile('none'), clock: steppingClock(), recorder };
  const decision = await decide(deps, { idle: true }, questions);
  expect(decision).toEqual({
    questions,
    answers: [
      {
        id: 'state',
        kind: 'Choice',
        answer: 'idle',
        probabilities: { working: 0, idle: 1 },
        confidence: 1,
      },
      { id: 'stuck', kind: 'Noul', answer: true, probabilities: 0.8 },
    ],
    backend: 'rules',
    at: '2026-09-24T12:00:00.000Z',
    latencyMs: 1000,
  });
  expect(recorder.decisions).toEqual([decision]);
  const failing = { record: () => Promise.reject(new Error('vault locked')) };
  await expect(
    decide({ ...deps, recorder: failing }, { idle: true }, questions),
  ).resolves.toMatchObject({
    backend: 'rules',
  });
});

test('the profile names the backend: used when this site has it, else rules', () => {
  const all = [rules, fake(MODEL, working)];
  expect(selectBackend(all, profile(MODEL)).name).toBe(MODEL);
  expect(selectBackend(all, profile('none')).name).toBe('rules');
  expect(selectBackend([rules], profile(MODEL)).name).toBe('rules');
  expect(selectBackend([], profile('none')).name).toBe('rules');
});

test('rules answer first; the named backend only below the threshold, and only when well formed', async () => {
  const used = async (model: () => Promise<unknown>, state: State = { idle: false }) =>
    (
      await decide(
        {
          backends: [rules, fake(MODEL, model)],
          profile: profile(MODEL),
          clock: fixedClock(),
        },
        state,
        questions,
      )
    ).backend;
  // Rules are sure (1 and 0.8): the named backend is not asked. Unsure (even): it is.
  expect(await used(working, { idle: true })).toBe('rules');
  expect(await used(working)).toBe(MODEL);
  // Its failures keep the rules' answers, marked as a fallback.
  expect(await used(() => Promise.reject(new Error('timeout')))).toBe('rules-fallback');
  expect(await used(async () => (await working()).map((a) => ({ ...a, id: 'other' })))).toBe(
    'rules-fallback',
  );
  const [choice, noul] = await working();
  expect(
    await used(async () => [{ ...choice, probabilities: { working: 0.9, idle: 0.9 } }, noul]),
  ).toBe('rules-fallback');
  expect(await used(async () => [choice, { ...noul, probabilities: '0.2' }])).toBe(
    'rules-fallback',
  );
  expect(await used(async () => [choice])).toBe('rules-fallback');
  expect(await used(async () => [{ ...choice, answer: 'asleep' }, noul])).toBe('rules-fallback');

  // A Score between levels is not doubt: an even Score alone never asks the named backend.
  const score: Question[] = [{ kind: 'Score', id: 'urgency', levels: ['low', 'high'] }];
  const scored = await decide(
    {
      backends: [rules, fake(MODEL, () => Promise.reject(new Error('asked')))],
      profile: profile(MODEL),
      clock: fixedClock(),
    },
    { idle: false },
    score,
  );
  expect(scored).toMatchObject({ backend: 'rules', answers: [{ answer: 0.5, confidence: 0.5 }] });

  // Rules that throw give even answers, labelled rules; with no other backend, they stand.
  const broken = rulesBackend<State>([
    {
      when: () => {
        throw new Error('bad rule');
      },
      answer: () => ({}),
    },
  ]);
  const even = await decide(
    { backends: [broken], profile: profile(MODEL), clock: fixedClock() },
    { idle: true },
    questions,
  );
  expect(even.backend).toBe('rules');
  expect(even.answers.map((a) => a.probabilities)).toEqual([{ working: 0.5, idle: 0.5 }, 0.5]);
});

test("a model's reply keeps the model id and cost it reports; a fallback keeps neither", async () => {
  const ask = (model: () => Promise<unknown>) =>
    decide(
      { backends: [rules, fake(MODEL, model)], profile: profile(MODEL), clock: fixedClock() },
      { idle: false },
      questions,
    );
  const replied = await ask(async () => ({
    answers: await working(),
    model: 'jev-1.13.0',
    costUsd: 0.000004,
  }));
  expect(replied).toMatchObject({ backend: 'jev', model: 'jev-1.13.0', costUsd: 0.000004 });
  const failed = await ask(() => Promise.reject(new Error('Jev is unavailable (HTTP 503)')));
  expect(failed).toMatchObject({
    backend: 'rules-fallback',
    fallbackReason: 'Jev is unavailable (HTTP 503)',
  });
  expect(failed).not.toHaveProperty('model');
});

test('invalid questions are a usage error', async () => {
  const ask = (qs: unknown) =>
    decide(
      { backends: [rules], profile: profile('none'), clock: fixedClock() },
      { idle: true },
      qs as Question[],
    );
  const cases: unknown[] = [
    [],
    [{ kind: 'Choice', id: 'a', options: ['only'] }],
    [{ kind: 'Choice', id: 'a', options: Array.from({ length: 256 }, (_, i) => `o${i}`) }],
    [{ kind: 'Choice', id: 'a', options: ['x', 'x'] }],
    [{ kind: 'Score', id: 'a', levels: Array.from({ length: 11 }, (_, i) => `l${i}`) }],
    [{ kind: 'Noul', id: 'a' }],
    [{ kind: 'Noul', id: 'a', statement: '' }],
    [{ kind: 'Open', id: 'a' }],
    [questions[1], questions[1]],
  ];
  for (const qs of cases) {
    await expect(ask(qs), JSON.stringify(qs).slice(0, 60)).rejects.toMatchObject({ code: 'usage' });
  }
});
