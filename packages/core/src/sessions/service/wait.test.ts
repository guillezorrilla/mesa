import { expect, test } from 'vitest';
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
  /** `id`'s hook `event`, stamped now, or at `when` (a hook that ran late). */
  const hook = (id: string, event: string, extra: Record<string, unknown> = {}, when?: number) =>
    recordHookEvent(
      {
        store,
        eventsDir: profilePaths(home, 'default').events,
        clock: () => new Date(when ?? now),
        home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: id,
        payload: JSON.stringify({ hook_event_name: event, ...extra }),
      },
    );
  return { mesa, a, b, hook, at, store, sleeps: () => sleeps };
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

test('past --timeout it returns the states so far with timeout; a session over ends the wait', async () => {
  const { mesa, a, b, hook, at, store } = await waiting();
  at.set(1, () => hook(a.id, 'Stop'));
  expect(await mesa.sessions.wait([a.id, b.id], { timeoutSeconds: 5 })).toEqual({
    sessions: [
      { id: a.id, state: 'idle' },
      { id: b.id, state: 'working' },
    ],
    timeout: true,
  });
  await expect(mesa.sessions.wait(['nobody00'])).rejects.toMatchObject({ code: 'not_found' });
  // A crash fires no hook: its record, once over, ends the wait.
  at.clear();
  const crashed = {
    state: 'failed',
    confidence: 1,
    at: new Date(START).toISOString(),
    source: 'tmux',
  } as const;
  at.set(8, () => store.update(b.id, { lastState: crashed, endedAt: crashed.at }));
  expect((await mesa.sessions.wait([b.id])).sessions).toEqual([{ id: b.id, state: 'failed' }]);
});

test('the latest state hook by time wins, not the last line logged', async () => {
  const { mesa, a, hook, at } = await waiting();
  // A tool hook that ran before the Stop but was logged after it: the Stop is still the latest.
  at.set(1, () => {
    hook(a.id, 'Stop');
    hook(a.id, 'PostToolUse', { tool_name: 'Bash' }, START);
  });
  const done = await mesa.sessions.wait([a.id]);
  expect(done.sessions).toEqual([{ id: a.id, state: 'idle' }]);
});
