import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { fakeHttp } from '../testing/index.js';
import { checked } from './decide.js';
import { strandsBackend, strandsHealth } from './strands.js';
import type { Question } from './types.js';

// Replies recorded from the pinned `strands-decider serve --device mlx --strict-window` (#459).
const recorded = (name: string) =>
  JSON.parse(readFileSync(new URL(`fixtures/strands/${name}.json`, import.meta.url), 'utf8'));

const url = 'http://127.0.0.1:8099';
const questions: Question[] = [
  {
    kind: 'Choice',
    id: 'state',
    options: ['working', 'waiting-permission', 'idle'],
    instructions: 'Which state is this coding agent session in, judging only by its screen?',
    criteria: {
      working: 'The agent is in the middle of a turn: running tools, thinking or streaming output.',
      'waiting-permission':
        'The agent stopped to ask the human to approve a command, tool or file change.',
    },
  },
  {
    kind: 'Score',
    id: 'urgency',
    levels: ['none', 'low', 'high'],
    instructions: 'How urgently is a human needed?',
  },
  {
    kind: 'Noul',
    id: 'human',
    statement: 'A human is needed now',
    criteria: {
      true: 'Someone must act before the agent continues.',
      false: 'The agent can continue alone.',
    },
  },
];
const backend = (reply: { status?: number; body: unknown }) => {
  const web = fakeHttp({ [`POST ${url}/v1/systemone`]: reply });
  return { web, strands: strandsBackend({ http: web.http, url, deadlineMs: 1000 }) };
};

test('a recorded reply maps to Faro answers: Score indices to 0-1, probabilities renormalised', async () => {
  const { web, strands } = backend({ body: recorded('three-kinds') });
  const answers = checked(questions, await strands.answer('Agent: claude ...', questions));
  const [choice, score, noul] = answers;
  expect(choice).toMatchObject({
    kind: 'Choice',
    answer: 'waiting-permission',
    confidence: 0.7013,
  });
  expect(score).toMatchObject({ kind: 'Score', confidence: 0.3368 });
  expect(score?.answer).toBeCloseTo(0.809 / 2, 6);
  expect(noul).toEqual({ id: 'human', kind: 'Noul', answer: false, probabilities: 0.2817 });
  // The wire rounds to 4 places; Faro's check needs a sum within 1e-6.
  const total = Object.values(score?.kind === 'Score' ? score.probabilities : {}).reduce(
    (a, b) => a + b,
  );
  expect(total).toBeCloseTo(1, 9);
  // The request carries the wording: a description per described option, null otherwise.
  expect(JSON.parse(web.requests[0]?.body ?? '')).toMatchObject({
    state: 'Agent: claude ...',
    questions: {
      state: { type: 'choice', criteria: { idle: null } },
      urgency: { type: 'score', criteria: ['none', 'low', 'high'] },
      human: { type: 'noul', instructions: 'A human is needed now' },
    },
  });
});

test('probabilities the wire rounded off 1 still pass Faro check once renormalised', async () => {
  const reply = recorded('three-kinds');
  const thirds = { working: 0.3333, 'waiting-permission': 0.3333, idle: 0.3333 };
  const state = { ...reply.answers.state, choice: 'working', probabilities: thirds };
  const { strands } = backend({ body: { ...reply, answers: { ...reply.answers, state } } });
  const [choice] = checked(questions, await strands.answer('s', questions));
  expect(choice?.kind === 'Choice' && choice.probabilities.working).toBeCloseTo(1 / 3, 9);
});

test('the strict window, a missing answer and an answer outside the options all throw', async () => {
  await expect(
    backend({ status: 422, body: recorded('overflow') }).strands.answer('long', questions),
  ).rejects.toThrow('HTTP 422');
  const reply = recorded('three-kinds');
  const { human: _, ...twoOnly } = reply.answers;
  await expect(
    backend({ body: { ...reply, answers: twoOnly } }).strands.answer('s', questions),
  ).rejects.toThrow('did not answer human');
  const stray = { ...reply.answers.state, choice: 'done' };
  await expect(
    backend({ body: { ...reply, answers: { ...reply.answers, state: stray } } }).strands.answer(
      's',
      questions,
    ),
  ).rejects.toThrow('did not answer state');
  const unlikely = { ...reply.answers.state, choice: 'idle' };
  await expect(
    backend({ body: { ...reply, answers: { ...reply.answers, state: unlikely } } }).strands.answer(
      's',
      questions,
    ),
  ).rejects.toThrow('did not answer state');
});

test('health names the model and window, and refuses something that is not a Strands server', async () => {
  const health = {
    status: 'ok',
    model: 'strands-decider-2B-hobson-v19',
    base_model: '/models/base',
    num_slots: 24,
    max_length: 4096,
    device: 'mlx',
  };
  const ok = fakeHttp({ [`GET ${url}/health`]: { body: health } });
  await expect(strandsHealth({ http: ok.http, url, deadlineMs: 1000 })).resolves.toMatchObject({
    num_slots: 24,
    max_length: 4096,
  });
  const other = fakeHttp({ [`GET ${url}/health`]: { body: { status: 'ok' } } });
  await expect(strandsHealth({ http: other.http, url, deadlineMs: 1000 })).rejects.toThrow(
    'unexpected body',
  );
});
