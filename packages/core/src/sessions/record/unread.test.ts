import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  fakeTmux,
  fixedClock,
  lockDeps,
  newSession,
  sequentialIds,
  tempDir,
} from '../../testing/index.js';
import { listSessions } from '../board/board.js';
import type { HookEvent } from '../signals/hook-events.js';
import { sessionStore } from './store.js';
import { markRead, markUnread, unreadOn } from './unread.js';

const hook = (event: string, at: string): HookEvent => ({
  at,
  agent: 'claude',
  event,
  payload: { hook_event_name: event },
});

test('a finished turn is unread until read, and the next finished turn is unread again', async () => {
  const store = sessionStore({
    dir: join(tempDir(), 'sessions'),
    newId: sequentialIds(),
    lock: lockDeps(),
  });
  const window = 'claude-aaaaaa';
  const session = store.create(() =>
    newSession({
      project: 'lantern-cove',
      startedAt: '2026-09-24T11:59:00.000Z',
      tmux: { socket: 'mesa-default', session: 'lantern-cove', window },
    }),
  );
  const tmux = fakeTmux();
  tmux.addWindow({ project: 'lantern-cove', window });
  let events: HookEvent[] = [hook('UserPromptSubmit', '2026-09-24T11:59:10.000Z')];
  const look = async (now: string) => {
    const [row] = await listSessions({
      store,
      tmux,
      events: () => events,
      priorityOf: () => 0.5,
      faro: { decisions: { model: 'none' as const, threshold: 0.7 } },
      env: { CODEX_HOME: tempDir('codex-') },
      home: tempDir(),
      listing: async () => [],
      projects: [],
      elsewhere: () => new Set<string>(),
      clock: fixedClock(now),
    });
    return row?.managed ? row.unread : 'foreign';
  };

  expect(await look('2026-09-24T11:59:20.000Z')).toBeUndefined();
  events = [...events, hook('Stop', '2026-09-24T11:59:30.000Z')];
  expect(await look('2026-09-24T11:59:31.000Z')).toBe(true);
  expect(store.get(session.id).unread).toBe(true);

  markRead(store, session.id, '2026-09-24T11:59:40.000Z');
  // A mark writes only its own fields: the state the look saved stands.
  expect(store.get(session.id)).toMatchObject({
    seenAt: '2026-09-24T11:59:40.000Z',
    lastState: { state: 'idle', at: '2026-09-24T11:59:30.000Z' },
  });
  expect(store.get(session.id).unread).toBeUndefined();
  // Still idle from the same Stop: it stays read.
  expect(await look('2026-09-24T11:59:45.000Z')).toBeUndefined();

  markUnread(store, session.id);
  expect(await look('2026-09-24T11:59:46.000Z')).toBe(true);
  markRead(store, session.id, '2026-09-24T11:59:47.000Z');

  events = [...events, hook('UserPromptSubmit', '2026-09-24T11:59:50.000Z')];
  expect(await look('2026-09-24T11:59:51.000Z')).toBeUndefined();
  events = [...events, hook('Stop', '2026-09-24T12:00:00.000Z')];
  expect(await look('2026-09-24T12:00:01.000Z')).toBe(true);
});

test('work that ends in idle, done or failed turns unread; a terminal, a stop, or an idle exit does not', () => {
  const at = (state: 'working' | 'waiting-question' | 'idle' | 'queued') => ({
    agent: 'claude' as const,
    lastState: { state, confidence: 1, at: '2026-09-24T12:00:00.000Z', source: 'hook' as const },
  });
  for (const next of ['idle', 'done', 'failed'] as const) {
    expect(unreadOn(at('working'), next)).toEqual({ unread: true });
    expect(unreadOn(at('waiting-question'), next)).toEqual({ unread: true });
  }
  expect(unreadOn(at('working'), 'stopped')).toEqual({});
  expect(unreadOn(at('working'), 'waiting-permission')).toEqual({});
  expect(unreadOn(at('idle'), 'done')).toEqual({});
  expect(unreadOn(at('queued'), 'failed')).toEqual({});
  expect(unreadOn({ ...at('working'), agent: 'terminal' }, 'done')).toEqual({});
});
