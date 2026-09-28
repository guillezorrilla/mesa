import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { FaroProfile } from '../decisions/decide.js';
import { fixedClock } from '../testing/index.js';
import { attentionWeights, classify, classifySession, type SessionSignals } from './state.js';
import { AGENT_STATES } from './states.js';

const dir = join(import.meta.dirname, 'fixtures/state');
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const profile: FaroProfile = {
  decisions: { backend: 'rules', threshold: 0.7 },
};
const deps = { profile, clock: fixedClock() };

test('there are at least ten recorded snapshots', () => {
  expect(fixtures.length).toBeGreaterThanOrEqual(10);
});

test.each(fixtures)('$name: $note', async ({ input, expected }) => {
  const signals = input as SessionSignals;
  expect(classify(signals)).toMatchObject(expected);
  const { lastState, attention, decision } = await classifySession(deps, signals);
  expect(lastState).toMatchObject(expected);
  expect(attention).toBeGreaterThanOrEqual(0);
  expect(attention).toBeLessThanOrEqual(1);
  const [state, score, human] = decision.answers;
  expect(state).toMatchObject({ kind: 'Choice', answer: expected.state });
  expect(Object.keys(state?.kind === 'Choice' ? state.probabilities : {})).toEqual([
    ...AGENT_STATES,
  ]);
  expect(score?.kind).toBe('Score');
  // "A human is needed now" leans yes exactly for the waiting states.
  expect(human).toMatchObject({ kind: 'Noul', answer: expected.state.startsWith('waiting') });
  expect(decision.backend).toBe('rules');
});

const at = (
  state: SessionSignals['last']['state'],
  secondsAgo: number,
  priority: number,
): number => {
  const signals: SessionSignals = {
    now: '2026-09-24T12:00:00.000Z',
    agent: 'claude',
    last: {
      state,
      confidence: 0.95,
      at: new Date(Date.parse('2026-09-24T12:00:00.000Z') - secondsAgo * 1000).toISOString(),
      source: 'hook',
    },
    ended: false,
    priority,
  };
  const w = attentionWeights(classify(signals), signals);
  const levels = ['none', 'low', 'medium', 'high', 'urgent'];
  const total = levels.reduce((s, l) => s + (w[l] ?? 0), 0);
  return levels.reduce((s, l, i) => s + ((w[l] ?? 0) / total) * (i / 4), 0);
};

test('a waiting session always outranks a working one, and climbs with time and priority', () => {
  for (const seconds of [0, 30, 300, 3600, 86400]) {
    for (const p of [0, 0.5, 1]) {
      for (const waiting of ['waiting-permission', 'waiting-question'] as const) {
        for (const other of ['working', 'idle', 'done', 'failed'] as const) {
          expect(at(waiting, 0, 0), `${waiting} vs ${other} ${seconds}s p${p}`).toBeGreaterThan(
            at(other, seconds, p),
          );
        }
      }
    }
  }
  expect(at('waiting-permission', 0, 0)).toBe(0.75);
  expect(at('waiting-permission', 300, 1)).toBeGreaterThan(at('waiting-permission', 0, 0));
  expect(at('working', 0, 1)).toBeGreaterThan(at('working', 0, 0));
  expect(at('working', 86400, 1)).toBeLessThanOrEqual(0.125);
  expect(at('idle', 600, 0)).toBeGreaterThan(at('idle', 0, 0));
});

test('classifySession asks the adapter only when the rules are unsure, and takes its state', async () => {
  const calls: string[] = [];
  const adapter = {
    name: 'adapter' as const,
    answer: async (s: SessionSignals) => {
      calls.push(s.tail ?? 'no tail');
      return {
        answers: [
          {
            id: 'state',
            kind: 'Choice',
            answer: 'waiting-question',
            probabilities: Object.fromEntries(
              AGENT_STATES.map((n) => [n, n === 'waiting-question' ? 0.9 : 0.02]),
            ),
            confidence: 0.9,
          },
          {
            id: 'attention',
            kind: 'Score',
            answer: 0.75,
            probabilities: { none: 0, low: 0, medium: 0, high: 1, urgent: 0 },
            confidence: 1,
          },
          { id: 'human', kind: 'Noul', answer: true, probabilities: 0.9 },
        ],
        costUsd: 0.003,
      };
    },
  };
  const adapterProfile: FaroProfile = {
    decisions: { backend: 'adapter', threshold: 0.7 },
  };
  const sure = fixtures.find((f) => f.name === 'permission-request-fresh.json')
    ?.input as SessionSignals;
  const unsure = fixtures.find((f) => f.name === 'tail-busy-screen.json')?.input as SessionSignals;
  const placed = (signals: SessionSignals) =>
    classifySession({ profile: adapterProfile, clock: fixedClock(), backends: [adapter] }, signals);

  // A fresh hook (0.95): the rules stand and the adapter is never asked.
  expect((await placed(sure)).decision.backend).toBe('rules');
  expect(calls).toEqual([]);
  // The tail alone (0.6, below 0.7): the adapter answers, and its state is the row's.
  const { lastState, decision } = await placed(unsure);
  expect(calls).toHaveLength(1);
  expect(decision).toMatchObject({ backend: 'adapter', costUsd: 0.003 });
  expect(lastState).toMatchObject({
    state: 'waiting-question',
    confidence: 0.9,
    source: 'adapter',
  });
  // Attention is the rules' band for the adapter's state: a wait, at least 0.75.
  expect((await placed(unsure)).attention).toBeGreaterThanOrEqual(0.75);

  // The next look sees the same screen: the saved answer stands, and the adapter is not asked.
  calls.length = 0;
  const again = await placed({ ...unsure, last: lastState });
  expect(calls).toEqual([]);
  expect(again.lastState).toEqual(lastState);
  // The screen changes: it is asked again.
  await placed({ ...unsure, last: lastState, tail: `${unsure.tail}\n` });
  expect(calls).toHaveLength(1);
});

test('Antigravity idle TUI stays idle even when the profile adapter would guess a wait', async () => {
  const signals: SessionSignals = {
    now: '2026-09-24T12:00:00.000Z',
    agent: 'antigravity',
    last: {
      state: 'waiting-question',
      confidence: 0.62,
      at: '2026-09-24T11:59:00.000Z',
      source: 'adapter',
      basis: 'old',
    },
    ended: false,
    window: { exists: true, dead: false },
    tail: '>\n? for shortcuts',
    priority: 0.5,
  };
  const answer = async () => {
    throw new Error('adapter must not run');
  };
  const placed = await classifySession(
    {
      profile: { decisions: { backend: 'adapter', threshold: 0.7 } },
      clock: fixedClock(),
      backends: [{ name: 'adapter', answer }],
    },
    signals,
  );
  expect(placed.lastState).toMatchObject({ state: 'idle', source: 'tmux' });
  expect(placed.decision.backend).toBe('rules');
});

test('an explicit Codex idle prompt clears an adapter false wait', async () => {
  const signals: SessionSignals = {
    now: '2026-09-28T21:56:30.000Z',
    agent: 'codex',
    last: {
      state: 'waiting-question',
      confidence: 0.82,
      at: '2026-09-28T21:56:18.000Z',
      source: 'adapter',
      basis: 'old',
    },
    ended: false,
    window: { exists: true, dead: false },
    tail: '• ONE\n\n› Ask Codex to do anything\n? for shortcuts',
    priority: 0,
  };
  const answer = async () => {
    throw new Error('adapter must not override the native idle marker');
  };
  const placed = await classifySession(
    {
      profile: { decisions: { backend: 'adapter', threshold: 0.7 } },
      clock: fixedClock(),
      backends: [{ name: 'adapter', answer }],
    },
    signals,
  );
  expect(placed.lastState).toMatchObject({ state: 'idle', source: 'tmux' });
  expect(placed.decision.backend).toBe('rules');
});
