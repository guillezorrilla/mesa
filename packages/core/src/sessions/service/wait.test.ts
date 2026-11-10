import { expect, test } from 'vitest';
import { MesaError } from '../../lib/result.js';
import { agentWorld, profilePaths, projectProfile, testStore } from '../../testing/index.js';
import { recordHookEvent } from '../signals/hook-events.js';

const START = Date.parse('2026-09-24T12:00:00.000Z');

/**
 * Two claude sessions on lantern-cove over a fake clock; each `mesa wait` poll sleeps a second of
 * it and first runs what `at` holds for that second, such as a session's Stop hook.
 */
async function waiting() {
  const world = agentWorld();
  let now = START;
  const at = new Map<number, () => void>();
  let sleeps = 0;
  const { home, mesa } = projectProfile(world.run, {
    clock: () => new Date(now),
    sleep: async (ms) => {
      sleeps++;
      now += ms;
      at.get(sleeps)?.();
    },
  });
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (await mesa.sessions.open('lantern-cove')).result;
  const store = testStore(home);
  for (const id of [a.id, b.id])
    store.update(id, {
      lastState: {
        state: 'working',
        confidence: 1,
        at: new Date(START).toISOString(),
        source: 'hook',
      },
    });
  const hook = (id: string, event: string, extra: Record<string, unknown> = {}) =>
    recordHookEvent(
      {
        store,
        eventsDir: profilePaths(home, 'default').events,
        clock: () => new Date(now),
        home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: id,
        payload: JSON.stringify({ hook_event_name: event, ...extra }),
      },
    );
  return { mesa, a, b, hook, at, sleeps: () => sleeps };
}

test('wait returns once every session left working, each with its state', async () => {
  const { mesa, a, b, hook, at } = await waiting();
  at.set(2, () => hook(a.id, 'Stop'));
  at.set(5, () =>
    hook(b.id, 'PreToolUse', { tool_name: 'AskUserQuestion', tool_input: { questions: [] } }),
  );
  const done = await mesa.sessions.wait([a.id, b.id]);
  expect(done).toEqual({
    sessions: [
      { id: a.id, state: 'idle' },
      { id: b.id, state: 'waiting-question' },
    ],
  });
});

test('--any returns on the first session to leave working', async () => {
  const { mesa, a, b, hook, at, sleeps } = await waiting();
  at.set(3, () => hook(b.id, 'Stop'));
  const done = await mesa.sessions.wait([a.id, b.id], { any: true });
  expect(done.sessions).toEqual([
    { id: a.id, state: 'working' },
    { id: b.id, state: 'idle' },
  ]);
  expect(sleeps()).toBe(3);
});

test('past --timeout it is a timeout error with the states so far', async () => {
  const { mesa, a, b, hook, at } = await waiting();
  at.set(1, () => hook(a.id, 'Stop'));
  const failed = await mesa.sessions.wait([a.id, b.id], { timeoutSeconds: 5 }).catch((e) => e);
  expect(failed).toBeInstanceOf(MesaError);
  expect(failed).toMatchObject({
    code: 'timeout',
    message: `${b.id} still working after 5 s`,
    details: {
      sessions: [
        { id: a.id, state: 'idle' },
        { id: b.id, state: 'working' },
      ],
    },
  });
  await expect(mesa.sessions.wait(['nobody00'])).rejects.toMatchObject({ code: 'not_found' });
});
