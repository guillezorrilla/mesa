import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { AGENT_STATES } from '../../agents/states.js';
import type { FaroProfile } from '../../decisions/decide.js';
import { fixedClock } from '../../testing/index.js';
import { attentionWeights, classify, classifySession, type SessionSignals } from './state.js';

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

test('classifySession asks only the rules: an unsure screen replaces a state the adapter saved', async () => {
  const unsure = fixtures.find((f) => f.name === 'tail-busy-screen.json')?.input as SessionSignals;
  const adapted: SessionSignals['last'] = {
    state: 'waiting-question',
    confidence: 0.9,
    at: '2026-09-24T11:59:00.000Z',
    source: 'adapter',
    basis: '0123456789abcdef',
  };
  // The tail alone (0.6, below the 0.7 threshold): the rules' reading still stands.
  const { lastState, decision } = await classifySession(deps, { ...unsure, last: adapted });
  expect(decision.backend).toBe('rules');
  expect(lastState).toEqual({
    state: 'working',
    confidence: 0.6,
    source: 'tmux',
    at: '2026-09-24T12:00:00.000Z',
  });
});

test('Antigravity idle TUI clears a wait the adapter saved', async () => {
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
  const placed = await classifySession(deps, signals);
  expect(placed.lastState).toMatchObject({ state: 'idle', source: 'tmux' });
  expect(placed.decision.backend).toBe('rules');
});

test('an explicit Codex idle prompt clears a false wait the adapter saved', async () => {
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
  const placed = await classifySession(deps, signals);
  expect(placed.lastState).toMatchObject({ state: 'idle', source: 'tmux' });
  expect(placed.decision.backend).toBe('rules');
});
