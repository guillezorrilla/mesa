import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { codexHookState } from '../../agents/codex/hook-state.js';
import { fixedClock, lockDeps, newSession, sequentialIds, tempDir } from '../../testing/index.js';
import { sessionStore } from '../record/store.js';
import { eventsLog, readHookEvents, recordHookEvent } from './hook-events.js';

const payloads = JSON.parse(
  readFileSync(new URL('../../agents/codex/fixtures/hooks.json', import.meta.url), 'utf8'),
) as Record<string, unknown>[];
const thread = payloads[0]?.session_id;
function setup() {
  const dir = tempDir();
  const store = sessionStore({ dir, newId: sequentialIds(), lock: lockDeps() });
  const session = store.create(() => newSession({ agent: 'codex' }));
  const deps = {
    store,
    eventsDir: join(dir, 'events'),
    clock: fixedClock(),
    home: '/Users/example',
    secrets: () => ['invented-secret'],
  };
  const hook = (payload: object, mesaSessionId: string | undefined = session.id) =>
    recordHookEvent(deps, { agent: 'codex', mesaSessionId, payload: JSON.stringify(payload) });
  return { deps, store, session, hook };
}

test('spike payloads claim the first SessionStart, log redacted payloads, and map states', () => {
  const { deps, store, session, hook } = setup();
  for (const payload of payloads) hook(payload);
  expect(store.get(session.id).agentSessionId).toBe(thread);
  const events = readHookEvents(deps.eventsDir, session.id);
  expect(events.map((e) => codexHookState(e.event))).toEqual([
    'idle',
    'working',
    undefined,
    'waiting-permission',
    'working',
    'idle',
    'idle',
    'done',
  ]);
  expect(events[0]?.payload).toMatchObject({ cwd: '~/lantern-cove' });
  hook({
    session_id: thread,
    hook_event_name: 'Stop',
    api_key: 'invented-key',
    prompt: 'invented-secret',
  });
  expect(readHookEvents(deps.eventsDir, session.id).at(-1)?.payload).toMatchObject({
    api_key: '***',
    prompt: '***',
  });
  for (const reason of ['other', 'clear', 'resume']) {
    const event = hook({ session_id: thread, hook_event_name: 'SessionEnd', reason });
    expect(event && codexHookState(event.event)).toBe('done');
  }
});

test('only SessionStart claims an id; a prompt-less SessionEnd is logged as done without claiming', () => {
  const { deps, store, session, hook } = setup();
  expect(hook({ session_id: thread, hook_event_name: 'Stop' })).toBeUndefined();
  expect(store.get(session.id).agentSessionId).toBeUndefined();
  expect(
    hook({ session_id: thread, hook_event_name: 'SessionEnd', reason: 'other' }),
  ).toBeDefined();
  expect(store.get(session.id).agentSessionId).toBeUndefined();
  expect(readHookEvents(deps.eventsDir, session.id)).toHaveLength(1);
});

test('known payload id selects its record, but outside Mesa, wrong agents, and nested ids are refused', () => {
  const { deps, store, session, hook } = setup();
  hook(payloads[0] ?? {});
  const other = store.create(() => newSession({ agent: 'codex' }));
  const stop = { session_id: thread, hook_event_name: 'Stop' };
  expect(hook(stop, other.id)?.mesaSessionId).toBe(session.id);
  expect(existsSync(eventsLog(deps.eventsDir, other.id))).toBe(false);
  expect(recordHookEvent(deps, { agent: 'codex', payload: JSON.stringify(stop) })).toBeUndefined();
  expect(hook(stop, 'xxxxxxxx')).toBeUndefined();
  const claude = store.create(() => newSession({ agent: 'claude' }));
  expect(hook(stop, claude.id)).toBeUndefined();
  expect(
    hook({ session_id: 'nested', hook_event_name: 'SessionStart', source: 'startup' }),
  ).toMatchObject({ event: 'SessionIdentityAmbiguous' });
  expect(hook({ session_id: 'nested', hook_event_name: 'Stop' })).toBeUndefined();
  expect(hook({ hook_event_name: 'Stop' })).toBeUndefined();
  expect(store.get(session.id).agentSessionId).toBe(thread);
});
