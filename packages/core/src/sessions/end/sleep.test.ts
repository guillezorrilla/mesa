import { expect, test } from 'vitest';
import { profilePaths } from '../../profile/paths.js';
import {
  CLAUDE_VERSION,
  type FakeWindow,
  fakeTmux,
  lockDeps,
  newSession,
  projectProfile,
  scriptedRunner,
} from '../../testing/index.js';
import type { SessionRecord } from '../record/record.js';
import { sessionStore } from '../record/store.js';
import { type SleepSeen, sleepBlocker } from './sleep.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const IDLE_SINCE = '2026-11-10T11:00:00.000Z';
const finished = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  ...newSession({
    agent: 'claude',
    kind: 'interactive',
    lastState: { state: 'idle', confidence: 0.95, at: IDLE_SINCE, source: 'hook' },
  }),
  id: 'aaaaaaaa',
  events: [],
  ...over,
});
const seen = (over: Partial<SleepSeen> = {}): SleepSeen => ({
  now: NOW,
  afterMs: 30 * 60_000,
  alive: true,
  children: [],
  ...over,
});

test('a finished, read, unseen session idle long enough may sleep; each condition blocks it', () => {
  expect(sleepBlocker(finished(), seen())).toBeUndefined();
  expect(
    sleepBlocker(finished({ lastState: { ...finished().lastState, state: 'done' } }), seen()),
  ).toBeUndefined();
  const blocked: [Partial<SessionRecord>, Partial<SleepSeen>, string][] = [
    [{}, { afterMs: 0 }, 'sleep is off'],
    [{ agent: 'antigravity' }, {}, 'not an interactive Claude Code or Codex session'],
    [{ kind: 'run' }, {}, 'not an interactive Claude Code or Codex session'],
    [{ background: true }, {}, 'a background session'],
    [{ endedAt: IDLE_SINCE }, {}, 'not running'],
    [{ sleeping: { at: IDLE_SINCE } }, {}, 'not running'],
    [{}, { alive: false }, 'its agent is not running'],
    [
      { lastState: { state: 'working', confidence: 0.95, at: IDLE_SINCE, source: 'hook' } },
      {},
      'not finished',
    ],
    [
      {
        lastState: {
          state: 'waiting-permission',
          confidence: 0.95,
          at: IDLE_SINCE,
          source: 'hook',
        },
      },
      {},
      'not finished',
    ],
    [{ unread: true }, {}, 'unread'],
    [{}, { shown: 'aaaaaaaa' }, 'shown'],
    [{}, { children: [finished({ id: 'bbbbbbbb', parent: 'aaaaaaaa' })] }, 'a child is running'],
    [{}, { afterMs: 61 * 60_000 }, 'not idle long enough'],
  ];
  for (const [record, look, why] of blocked)
    expect(sleepBlocker(finished(record), seen(look))).toBe(why);
  // A child that ended, or sleeps, does not hold its parent awake.
  const resting = [
    finished({ id: 'bbbbbbbb', endedAt: IDLE_SINCE }),
    finished({ id: 'cccccccc', sleeping: { at: IDLE_SINCE } }),
  ];
  expect(sleepBlocker(finished(), seen({ children: resting }))).toBeUndefined();
});

/** A profile with lantern-cove and one Claude session open, whose claude exits on /exit. */
async function opened() {
  const world = fakeTmux({
    onKeys: (w: FakeWindow, text: string) => {
      if (text === '/exit') w.dead = true;
    },
  });
  const scripted = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION });
  let now = '2026-11-10T12:00:00.000Z';
  const { mesa, home } = projectProfile(scripted.run, {
    sleep: async () => {},
    clock: () => new Date(now),
  });
  const { result } = await mesa.sessions.open('lantern-cove');
  const store = sessionStore({
    dir: profilePaths(home, 'default').sessions,
    newId: () => '01TESTZZZZZZZZZZZZZZNOUUID',
    lock: lockDeps(),
  });
  store.update(result.id, {
    agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
    lastState: { state: 'idle', confidence: 0.95, at: now, source: 'hook' },
  });
  return {
    mesa,
    world,
    store,
    id: result.id,
    calls: scripted.calls,
    later: (iso: string) => (now = iso),
  };
}

test('the sleep pass quits an idle session after the set time, keeps its record, and wake reopens it', async () => {
  const { mesa, world, store, id, later } = await opened();
  mesa.config.set('sessions.sleepAfterMinutes', '30');
  // Not yet idle long enough, or shown in a focused window: it stays awake.
  later('2026-11-10T12:29:00.000Z');
  expect(await mesa.sessions.sleepIdle()).toEqual([]);
  later('2026-11-10T12:31:00.000Z');
  expect(await mesa.sessions.sleepIdle({ shown: id })).toEqual([]);
  expect(await mesa.sessions.sleepIdle()).toEqual([id]);
  const asleep = store.get(id);
  expect(asleep).toMatchObject({ sleeping: { at: '2026-11-10T12:31:00.000Z' } });
  expect(asleep.endedAt).toBeUndefined();
  const ownWindow = () => world.windows.find((w) => w.window === asleep.tmux.window);
  expect(world.windows.some((w) => w.window === asleep.tmux.window)).toBe(false);
  // The quit's pane-died signal is not an exit: the session stays on the board, its state kept.
  await mesa.tmuxEvent('pane-died', asleep.tmux.session, asleep.tmux.window);
  expect(store.get(id).events.some((e) => e.type === 'exited')).toBe(false);
  const [row] = await mesa.sessions.list();
  expect(row).toMatchObject({ id, sleeping: { at: '2026-11-10T12:31:00.000Z' } });
  expect(row?.lastState.state).toBe('idle');

  const { result } = await mesa.sessions.wake(id);
  expect(result.record.id).toBe(id);
  expect(store.get(id).sleeping).toBeUndefined();
  expect(ownWindow()?.launch).toContain('--resume 36c173f2-803e-4845-bd97-a032b37c6d6d');
  expect(ownWindow()?.env.MESA_SESSION_ID).toBe(id);
  // Awake again: a second wake is refused.
  await expect(mesa.sessions.wake(id)).rejects.toThrow(`session ${id} is not asleep`);
});
