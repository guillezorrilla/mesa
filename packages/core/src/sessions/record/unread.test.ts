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
import type { SessionRecord } from './record.js';
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

  // A whole turn between two looks: idle, then idle from a later Stop.
  markRead(store, session.id, '2026-09-24T12:00:02.000Z');
  events = [
    ...events,
    hook('UserPromptSubmit', '2026-09-24T12:00:03.000Z'),
    hook('Stop', '2026-09-24T12:00:04.000Z'),
  ];
  expect(await look('2026-09-24T12:00:05.000Z')).toBe(true);
});

test('work that ends in idle, done or failed turns unread; a terminal, a stop, or an idle exit does not', () => {
  type Last = SessionRecord['lastState'];
  const last = (
    state: Last['state'],
    at = '2026-09-24T12:00:00.000Z',
    source: Last['source'] = 'hook',
  ) => ({ state, confidence: 1, at, source }) as Last;
  const from = (state: Last['state'], source: Last['source'] = 'hook') => ({
    agent: 'claude' as const,
    lastState: last(state, '2026-09-24T12:00:00.000Z', source),
  });
  const later = (state: Last['state']) => last(state, '2026-09-24T12:01:00.000Z');
  for (const next of ['idle', 'done', 'failed'] as const) {
    expect(unreadOn(from('working'), later(next))).toEqual({ unread: true });
    expect(unreadOn(from('waiting-question'), later(next))).toEqual({ unread: true });
  }
  // Idle again from a later Stop: a whole turn between two looks.
  expect(unreadOn(from('idle'), later('idle'))).toEqual({ unread: true });
  // A fresh agent's SessionStart after Mesa's launch guess.
  expect(unreadOn(from('idle', 'mesa'), later('idle'))).toEqual({});
  expect(unreadOn(from('working'), later('stopped'))).toEqual({});
  expect(unreadOn(from('working'), later('waiting-permission'))).toEqual({});
  expect(unreadOn(from('idle'), later('done'))).toEqual({});
  expect(unreadOn(from('queued'), later('failed'))).toEqual({});
  expect(unreadOn({ ...from('working'), agent: 'terminal' }, later('done'))).toEqual({});
});
