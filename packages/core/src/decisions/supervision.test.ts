import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { AGENT_STATES } from '../agents/states.js';
import type { Clock } from '../lib/clock.js';
import { placementStore, type Want } from '../sessions/signals/placements.js';
import {
  agentWorld,
  type FakeRequest,
  lockDeps,
  profilePaths,
  projectProfile,
  systemOneWorld,
  tempDir,
} from '../testing/index.js';
import { PER_TURN_MS } from './models.js';
import { automaticGate } from './site-mode.js';
import { ACCEPT_AT, DECISION_SITES, PASSED_GATE } from './sites.js';
import {
  type Placed,
  placeUnsure,
  SCREEN_CHARS,
  SUPERVISION_POLICY,
  supervisingModel,
  supervisionKey,
  supervisionState,
} from './supervision.js';
import { systemOneBackend } from './systemone.js';
import type { DecisionsModel } from './types.js';

const START = Date.parse('2026-10-06T12:00:00.000Z');
const PERMISSION = 'Bash command\n  rm -rf build/\nDo you want to proceed?\n> 1. Yes\n  2. No';

/** A clock a test moves by hand. */
function handClock() {
  let now = START;
  const clock: Clock = () => new Date(now);
  const pass = (ms: number) => {
    now += ms;
  };
  return { clock, pass };
}

/** Jev answers every supervision question with `state` at probability `p`, the rest even. */
function answering(world: ReturnType<typeof systemOneWorld>, state: string, p: number) {
  world.routes[`POST ${world.urls.jev}`] = (request: FakeRequest) => {
    const body = JSON.parse(request.body ?? '{}');
    const probabilities = Object.fromEntries(
      AGENT_STATES.map((s) => [s, s === state ? p : (1 - p) / (AGENT_STATES.length - 1)]),
    );
    const answers = { state: { type: 'choice', choice: state, probabilities, confidence: p } };
    return { body: { model: body.model, answers, usage: { input_tokens: 412 } } };
  };
}

/**
 * The placing call over a placements file, Jev in memory as the chosen model with its key, and a
 * hand clock; `model` and `hasKey` may change mid-test, as a person would. Unless a test gives its
 * own tables, every site that passed the quality gate runs automatically, as if proven.
 */
function placing() {
  const world = systemOneWorld();
  const time = handClock();
  const store = placementStore(join(tempDir(), 'placements.json'), {
    ...lockDeps(),
    clock: time.clock,
  });
  const chosen = { model: 'jev' as DecisionsModel, key: true };
  const backend = systemOneBackend({
    provider: 'jev',
    http: world.http,
    key: 'ts-test-0000',
    model: 'jev-1.13.0',
    deadlineMs: PER_TURN_MS,
  });
  const place = (tables?: Parameters<typeof placeUnsure>[0]['tables']) =>
    placeUnsure({
      store,
      model: () => chosen.model,
      backend: () => backend,
      hasKey: async () => chosen.key,
      clock: time.clock,
      tables: tables ?? { gate: PASSED_GATE, acceptAt: ACCEPT_AT },
    });
  const want = (id: string, screen: string): Want => {
    const state = supervisionState('claude', screen);
    return { key: supervisionKey(id, state, 'jev'), state };
  };
  return { world, store, chosen, place, want, ...time };
}

const saved = (placed: Placed[]) =>
  placed.map((p) => ('saved' in p ? p.saved : { dropped: p.dropped }));

test('an unsure screen is asked once with the supervision wording, and an accepted answer is saved for its screen', async () => {
  const { world, store, place, want } = placing();
  answering(world, 'waiting-permission', 0.9);
  const wanted = want('a1b2c3d4', PERMISSION);
  expect(store.look('a1b2c3d4', wanted)).toBeUndefined();
  const placed = await place();
  expect(saved(placed)).toEqual([
    {
      key: wanted.key,
      at: '2026-10-06T12:00:00.000Z',
      placed: { state: 'waiting-permission', confidence: 0.9, source: 'jev' },
      probabilities: expect.objectContaining({ idle: expect.closeTo(0.02) }),
      ask: { model: 'jev-1.13.0', margin: expect.closeTo(0.88), latencyMs: 0, inputTokens: 412 },
    },
  ]);
  const body = JSON.parse(world.requests[0]?.body ?? '{}');
  expect(body.state).toBe(`Agent: claude\nScreen tail:\n${PERMISSION}`);
  expect(body.questions.state.instructions).toBe(
    'Which state is this coding agent session in, judging only by its screen?',
  );
  expect(Object.keys(body.questions.state.criteria)).toEqual([...AGENT_STATES]);
  // The next look takes it; the same screen is never asked again.
  expect(store.look('a1b2c3d4', wanted)?.placed?.state).toBe('waiting-permission');
  expect(await place()).toEqual([]);
  expect(world.requests).toHaveLength(1);
});

test('below its threshold the model abstains, and the reply says so', async () => {
  const { world, store, place, want } = placing();
  answering(world, 'idle', 0.5);
  store.look('a1b2c3d4', want('a1b2c3d4', 'something no reader knows'));
  const [reply] = saved(await place());
  expect(reply).toMatchObject({
    ask: {
      model: 'jev-1.13.0',
      margin: expect.closeTo(0.4),
      fallbackReason: `abstained: margin 0.400 below ${ACCEPT_AT.jev.supervision}`,
    },
  });
  expect(reply).not.toHaveProperty('placed');
});

test('a model that did not pass the supervision gate is never asked', async () => {
  const { world, store, place, want } = placing();
  const gate = { jev: [], clef: DECISION_SITES };
  expect(supervisingModel('jev', gate)).toBeUndefined();
  expect(supervisingModel('clef', gate)).toBe('clef');
  expect(supervisingModel('none', gate)).toBeUndefined();
  store.look('a1b2c3d4', want('a1b2c3d4', PERMISSION));
  expect(await place({ gate, acceptAt: ACCEPT_AT })).toEqual([]);
  // Passed the quality gate but not yet the paired workflows, and no opt-in: not asked either.
  expect(await place({ gate: automaticGate(false), acceptAt: ACCEPT_AT })).toEqual([]);
  expect(world.requests).toHaveLength(0);
  expect(await place({ gate: automaticGate(true), acceptAt: ACCEPT_AT })).toHaveLength(1);
});

test('a stale reply is dropped: the screen changed, the model was switched, or its key removed', async () => {
  const { world, store, chosen, place, want } = placing();
  answering(world, 'working', 0.9);
  const answer = world.routes[`POST ${world.urls.jev}`] as (r: FakeRequest) => never;
  const during = (change: () => void) => {
    world.routes[`POST ${world.urls.jev}`] = (request: FakeRequest) => {
      change();
      return answer(request);
    };
  };

  store.look('a1b2c3d4', want('a1b2c3d4', 'first screen'));
  during(() => store.look('a1b2c3d4', want('a1b2c3d4', 'second screen')));
  expect(saved(await place())).toEqual([{ dropped: 'the screen changed' }]);

  // The new screen is asked next; the model is switched while it is.
  during(() => {
    chosen.model = 'clef';
  });
  expect(saved(await place())).toEqual([{ dropped: 'the model was switched' }]);

  chosen.model = 'jev';
  store.look('a1b2c3d4', want('a1b2c3d4', 'third screen'));
  during(() => {
    chosen.key = false;
  });
  expect(saved(await place())).toEqual([{ dropped: 'the key was removed' }]);
  expect(store.look('a1b2c3d4', want('a1b2c3d4', 'third screen'))).toBeUndefined();
});

test('asks are budgeted: one in flight per session, one per screen, at most 60 an hour', async () => {
  const { world, store, place, want, pass } = placing();
  answering(world, 'working', 0.9);
  store.look('a1b2c3d4', want('a1b2c3d4', 'screen 0'));
  // Two placing calls at once (the app's and a person's) ask once.
  const both = await Promise.all([place(), place()]);
  expect(both.map((p) => p.length).sort()).toEqual([0, 1]);
  expect(world.requests).toHaveLength(1);
  for (let i = 1; i < 60; i++) {
    pass(1000);
    store.look('a1b2c3d4', want('a1b2c3d4', `screen ${i}`));
    await place();
  }
  expect(world.requests).toHaveLength(60);
  store.look('a1b2c3d4', want('a1b2c3d4', 'screen 60'));
  const [over] = saved(await place());
  expect(world.requests).toHaveLength(60);
  expect(over).toMatchObject({
    ask: { model: 'jev-1.13.0', fallbackReason: 'budget reached: 60 asks in the last hour' },
  });
  // An hour after the first asks, the budget has room again.
  pass(3_600_000 - 59_000);
  store.look('a1b2c3d4', want('a1b2c3d4', 'screen 61'));
  expect(saved(await place())[0]).toHaveProperty('placed');
  expect(world.requests).toHaveLength(61);
});

test('a refused key, a rate limit or no network keep the rules state, with the reason', async () => {
  const { world, store, place, want } = placing();
  const reasonFor = async (screen: string) => {
    store.look('a1b2c3d4', want('a1b2c3d4', screen));
    const [reply] = saved(await place());
    expect(reply).not.toHaveProperty('placed');
    return reply && 'ask' in reply ? reply.ask.fallbackReason : undefined;
  };
  world.refuse('jev', 401);
  expect(await reasonFor('one')).toBe('Jev rejected the key (HTTP 401)');
  world.refuse('jev', 429);
  expect(await reasonFor('two')).toBe('Jev rate limit reached (HTTP 429)');
  world.refuse('jev');
  world.routes[`POST ${world.urls.jev}`] = () => {
    throw new TypeError('fetch failed');
  };
  expect(await reasonFor('three')).toBe('Jev could not be reached');
});

test('the screen sent is bounded, and the key changes with the screen, the model and the policy', () => {
  const long = Array.from({ length: 400 }, (_, i) => `line ${i} of build output`).join('\n');
  const state = supervisionState('codex', `${long}\n\n\n`);
  expect(state.startsWith('Agent: codex\nScreen tail:\n')).toBe(true);
  expect(state.length).toBe('Agent: codex\nScreen tail:\n'.length + SCREEN_CHARS);
  expect(state.endsWith('line 399 of build output')).toBe(true);
  const key = supervisionKey('a1b2c3d4', state, 'jev');
  expect(key).toMatch(/^a1b2c3d4:[0-9a-f]{16}:jev-1\.13\.0:/);
  expect(key.endsWith(SUPERVISION_POLICY)).toBe(true);
  expect(supervisionKey('a1b2c3d4', state, 'clef')).not.toBe(key);
  expect(supervisionKey('a1b2c3d4', `${state}.`, 'jev')).not.toBe(key);
});

/**
 * A profile with Jev chosen (its key set, which asks one test question) and one Claude session
 * whose screen only the tail speaks for: no hook, and no listing.
 */
async function boardWithModel() {
  const world = systemOneWorld();
  const agents = agentWorld();
  const { home, mesa } = projectProfile(agents.run, world.deps);
  await mesa.decisions.keys.set('typesafe', 'ts-test-0000-1111-abcd');
  // No site is proven before the paired workflows: the profile opts into experimental ones.
  mesa.config.set('decisions.experimental', 'true');
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  const pane = agents.tmux.opened[0];
  if (!pane) throw new Error('no window opened');
  pane.typed = ['Reading the screen...'];
  const hook = (event: string) => {
    const events = profilePaths(home, 'default').events;
    mkdirSync(events, { recursive: true });
    const line = { at: '2026-09-24T12:00:00.000Z', agent: 'claude', event, payload: {} };
    appendFileSync(join(events, `${opened.id}.jsonl`), `${JSON.stringify(line)}\n`);
  };
  const row = async () => {
    const found = (await mesa.sessions.list()).find((r) => r.id === opened.id);
    if (!found?.managed) throw new Error('no managed row');
    return found;
  };
  return { world, mesa, opened, row, hook };
}

test('the Board takes a saved placement beside its read, and a hook outranks it', async () => {
  const { world, mesa, opened, row, hook } = await boardWithModel();
  answering(world, 'waiting-question', 0.9);
  const asked = world.requests.length;
  // The look asks nothing: it says it wants the screen placed, and keeps the rules' state.
  const first = await row();
  expect(world.requests).toHaveLength(asked);
  expect(first.lastState.source).not.toBe('jev');
  expect(first.supervision).toEqual({ source: 'rules', pending: true });

  const placed = await mesa.decisions.place();
  expect(placed).toHaveLength(1);
  expect(world.requests).toHaveLength(asked + 1);
  const second = await row();
  expect(second.lastState).toMatchObject({
    state: 'waiting-question',
    confidence: 0.9,
    source: 'jev',
  });
  expect(second.supervision).toEqual({
    source: 'jev',
    model: 'jev-1.13.0',
    margin: expect.closeTo(0.88),
    latencyMs: 0,
    inputTokens: 412,
  });
  expect((await mesa.sessions.show(opened.id)).supervision).toEqual(second.supervision);

  // A hook speaks: the rules place it, and the model is not wanted.
  hook('UserPromptSubmit');
  const third = await row();
  expect(third.lastState).toMatchObject({ state: 'working', source: 'hook' });
  expect(third.supervision).toEqual({ source: 'rules' });
  expect(await mesa.decisions.place()).toEqual([]);
  expect(world.requests).toHaveLength(asked + 1);
});

test('the guardrail verdict is the rules alone with a model chosen, and asks no model', async () => {
  const world = systemOneWorld();
  const { mesa } = projectProfile(agentWorld().run, world.deps);
  const before = await mesa.guardrail.check('git push --force origin main');
  await mesa.decisions.keys.set('typesafe', 'ts-test-0000-1111-abcd');
  const asked = world.requests.length;
  const after = await mesa.guardrail.check('git push --force origin main');
  expect(after.verdict).toEqual(before.verdict);
  expect(after.decision.backend).toBe('rules');
  expect(world.requests).toHaveLength(asked);
});
