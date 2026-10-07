import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { fakeHttp } from '../testing/index.js';
import { checked } from './decide.js';
import { type SystemOneProvider, systemOneBackend } from './systemone.js';
import type { Question } from './types.js';

// Replies recorded live from Jev and CLEF on invented content, keys and account ID stripped.
const recorded = (provider: SystemOneProvider) =>
  JSON.parse(
    readFileSync(
      new URL(`fixtures/systemone/${provider}/three-kinds.json`, import.meta.url),
      'utf8',
    ),
  );

const KEY = 'sk-test-0123456789abcdef';
const ACCOUNT = 'acct-0001';
const URLS: Record<SystemOneProvider, string> = {
  jev: 'https://api.typesafe.ai/v1/systemone',
  clef: `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/cloudflare/clef-flash`,
};
const MODELS: Record<SystemOneProvider, string> = { jev: 'jev-1.13.0', clef: 'clef-flash' };

const THREE_KINDS: Question[] = [
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

/** A recorded System One body, as far as these tests read it. */
type Wire = {
  model: string;
  usage: { input_tokens: number };
  answers: {
    state: { choice: string; probabilities: Record<string, number> };
    urgency: { score: number };
    human: { noul: number };
  };
};
/** The System One body inside a recorded reply: Cloudflare wraps it. */
const bodyOf = (provider: SystemOneProvider, reply: Wire & { result?: Wire }): Wire =>
  provider === 'clef' && reply.result ? reply.result : reply;
/** `body` as `provider` sends it back. */
const wrap = (provider: SystemOneProvider, body: unknown) =>
  provider === 'clef' ? { success: true, errors: [], messages: [], result: body } : body;

const backend = (provider: SystemOneProvider, http: Http, deadlineMs = 1000) =>
  systemOneBackend({
    provider,
    http,
    key: KEY,
    model: MODELS[provider],
    deadlineMs,
    ...(provider === 'clef' ? { accountId: ACCOUNT } : {}),
  });
const replying = (provider: SystemOneProvider, reply: { status?: number; body: unknown }) => {
  const web = fakeHttp({ [`POST ${URLS[provider]}`]: reply });
  return { web, model: backend(provider, web.http) };
};

/** The MesaError `promise` rejects with; it must name the provider and never carry the key. */
async function failure(provider: SystemOneProvider, promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MesaError);
  const message = (error as MesaError).message;
  expect(message).toContain(provider === 'jev' ? 'Jev' : 'CLEF');
  expect(message).not.toContain(KEY);
  return message;
}

describe.each(['jev', 'clef'] as const)('%s', (provider) => {
  test('a recorded reply maps to Faro answers: Score indices to 0-1, probabilities renormalised', async () => {
    const reply = recorded(provider);
    const wire = bodyOf(provider, reply);
    const { web, model } = replying(provider, { body: reply });
    const out = await model.answer('Agent: claude ...', THREE_KINDS);
    const [choice, score, noul] = checked(THREE_KINDS, out.answers);
    expect(out.model).toBe(wire.model);
    expect(out.inputTokens).toBe(wire.usage.input_tokens);
    expect(out.costUsd).toBeGreaterThan(0);
    expect(choice).toMatchObject({ kind: 'Choice', answer: wire.answers.state.choice });
    expect(score?.answer).toBeCloseTo(wire.answers.urgency.score / 2, 6);
    expect(noul).toEqual({
      id: 'human',
      kind: 'Noul',
      answer: wire.answers.human.noul > 0.5,
      probabilities: wire.answers.human.noul,
    });
    const total = Object.values(score?.kind === 'Score' ? score.probabilities : {}).reduce(
      (a, b) => a + b,
    );
    expect(total).toBeCloseTo(1, 9);
    // The request carries the key as a bearer token, the pinned model and the wording.
    const [request] = web.requests;
    expect(request?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(request?.body ?? '')).toMatchObject({
      state: 'Agent: claude ...',
      model: MODELS[provider],
      questions: {
        state: { type: 'choice', criteria: { idle: null } },
        urgency: { type: 'score', criteria: ['none', 'low', 'high'] },
        human: { type: 'noul', instructions: 'A human is needed now' },
      },
    });
  });

  test('probabilities the wire rounded off 1 still pass Faro check once renormalised', async () => {
    const wire = bodyOf(provider, recorded(provider));
    const thirds = { working: 0.3333, 'waiting-permission': 0.3333, idle: 0.3333 };
    const state = { ...wire.answers.state, choice: 'working', probabilities: thirds };
    const body = wrap(provider, { ...wire, answers: { ...wire.answers, state } });
    const out = await replying(provider, { body }).model.answer('s', THREE_KINDS);
    const [choice] = checked(THREE_KINDS, out.answers);
    expect(choice?.kind === 'Choice' && choice.probabilities.working).toBeCloseTo(1 / 3, 9);
  });

  test('each HTTP failure throws a MesaError naming the provider, never the key', async () => {
    const cases: [number, string][] = [
      [401, 'rejected the key (HTTP 401)'],
      [403, 'rejected the key (HTTP 403)'],
      [422, 'refused the request (HTTP 422)'],
      [429, 'rate limit reached (HTTP 429)'],
      [529, 'is overloaded (HTTP 529)'],
      [503, 'is unavailable (HTTP 503)'],
    ];
    for (const [status, words] of cases) {
      const { model } = replying(provider, { status, body: { error: `bad ${KEY}` } });
      expect(await failure(provider, model.answer('s', THREE_KINDS))).toContain(words);
    }
  });

  test('the deadline and an unreachable host throw', async () => {
    const hang: Http = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
      );
    expect(await failure(provider, backend(provider, hang, 20).answer('s', THREE_KINDS))).toContain(
      'did not answer within 20 ms',
    );
    const down: Http = async () => {
      throw new TypeError(`fetch failed for ${KEY}`);
    };
    expect(await failure(provider, backend(provider, down).answer('s', THREE_KINDS))).toContain(
      'could not be reached',
    );
  });

  test('a missing answer, an answer off the options and a contradicting pick throw', async () => {
    const wire = bodyOf(provider, recorded(provider));
    const { human: _, ...twoOnly } = wire.answers;
    const missing = wrap(provider, { ...wire, answers: twoOnly });
    expect(
      await failure(provider, replying(provider, { body: missing }).model.answer('s', THREE_KINDS)),
    ).toContain('did not answer human');
    const probabilities: Record<string, number> = wire.answers.state.probabilities;
    const [unlikeliest] = Object.entries(probabilities).sort(([, a], [, b]) => a - b)[0] ?? [];
    for (const choice of ['done', unlikeliest]) {
      const state = { ...wire.answers.state, choice };
      const off = wrap(provider, { ...wire, answers: { ...wire.answers, state } });
      expect(
        await failure(provider, replying(provider, { body: off }).model.answer('s', THREE_KINDS)),
      ).toContain('did not answer state');
    }
    const odd = wrap(provider, { answers: 'none' });
    expect(
      await failure(provider, replying(provider, { body: odd }).model.answer('s', THREE_KINDS)),
    ).toContain('unexpected body');
  });
});

test('CLEF unwraps the envelope and reports success: false with its reason', async () => {
  const body = { success: false, errors: [{ code: 5007, message: 'No such model' }], result: null };
  const { model } = replying('clef', { body });
  expect(await failure('clef', model.answer('s', THREE_KINDS))).toContain(
    'reported an error: No such model',
  );
  const bare = bodyOf('clef', recorded('clef'));
  expect(
    await failure('clef', replying('clef', { body: bare }).model.answer('s', THREE_KINDS)),
  ).toContain('unexpected body');
});
