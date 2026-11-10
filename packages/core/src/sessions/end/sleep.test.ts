import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  shortIds,
  testStore,
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
  agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
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
    [{ agentSessionId: undefined }, {}, 'no conversation to reopen'],
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
  let onPause = () => {};
  const { mesa, home } = projectProfile(scripted.run, {
    // A pause is the agent getting on: one asked for by a wake's wait sees its SessionStart.
    sleep: async () => onPause(),
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
    home,
    /** Runs at every pause Mesa takes from now on. */
    whilePausing: (run: () => void) => {
      onPause = run;
    },
    id: result.id,
    calls: scripted.calls,
    later: (iso: string) => (now = iso),
  };
}

test('the sleep pass quits an idle session after the set time, keeps its record, and wake reopens it', async () => {
  const { mesa, world, store, id, later, home } = await opened();
  mesa.config.set('sessions.sleepAfterMinutes', '30');
  // Not yet idle long enough, or shown in a focused window: it stays awake.
  later('2026-11-10T12:29:00.000Z');
  expect(await mesa.sessions.sleepIdle()).toEqual({ slept: [] });
  later('2026-11-10T12:31:00.000Z');
  expect(await mesa.sessions.sleepIdle({ shown: id })).toEqual({ slept: [] });
  expect(await mesa.sessions.sleepIdle()).toEqual({ slept: [id] });
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

  // The quit's SessionEnd, as Claude Code logs it: a look before the wake reads the kept state.
  const log = join(profilePaths(home, 'default').events, `${id}.jsonl`);
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(
    log,
    `${JSON.stringify({ at: '2026-11-10T12:31:01.000Z', agent: 'claude', event: 'SessionEnd', agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d', payload: { hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' } })}\n`,
  );
  later('2026-11-10T12:45:00.000Z');
  const { result } = await mesa.sessions.wake(id);
  // Awake: the old SessionEnd no longer says done, and its idle time starts again.
  const [awake] = await mesa.sessions.list();
  expect(awake?.lastState.state).not.toBe('done');
  expect((await mesa.sessions.sleepIdle()).slept).toEqual([]);
  expect(result.record.id).toBe(id);
  expect(store.get(id).sleeping).toBeUndefined();
  expect(ownWindow()?.launch).toContain('--resume 36c173f2-803e-4845-bd97-a032b37c6d6d');
  expect(ownWindow()?.env.MESA_SESSION_ID).toBe(id);
  // Awake again: a second wake is refused, and the window it opened stays.
  await expect(mesa.sessions.wake(id)).rejects.toThrow(`session ${id} is not asleep`);
  expect(ownWindow()?.dead).toBe(false);
  // Asleep, then stopped: it ends, and is no longer asleep.
  later('2026-11-10T13:20:00.000Z');
  store.update(id, {
    lastState: { state: 'idle', confidence: 0.95, at: '2026-11-10T12:46:00.000Z', source: 'hook' },
  });
  expect((await mesa.sessions.sleepIdle()).slept).toEqual([id]);
  const { result: stopped } = await mesa.sessions.stop(id);
  expect(stopped.record.endedAt).toBeDefined();
  expect(stopped.record.sleeping).toBeUndefined();
});

test('a send to a sleeping session wakes it, waits for its SessionStart, then types', async () => {
  const { mesa, world, store, home, id, later, whilePausing } = await opened();
  mesa.config.set('sessions.sleepAfterMinutes', '30');
  later('2026-11-10T12:31:00.000Z');
  expect((await mesa.sessions.sleepIdle()).slept).toEqual([id]);
  later('2026-11-10T12:40:00.000Z');
  const log = join(profilePaths(home, 'default').events, `${id}.jsonl`);
  let started = false;
  whilePausing(() => {
    if (started || !world.windows.some((w) => w.window === `claude-${id}`)) return;
    started = true;
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(
      log,
      `${JSON.stringify({ at: '2026-11-10T12:40:01.000Z', agent: 'claude', event: 'SessionStart', agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d', payload: { hook_event_name: 'SessionStart', source: 'resume' } })}\n`,
    );
  });
  const { result } = await mesa.sessions.send(id, 'what is left?', { noFrom: true });
  expect(result).toMatchObject({ sent: true, woke: true });
  expect(result.warning).toBeUndefined();
  expect(store.get(id).sleeping).toBeUndefined();
  expect(world.windows.find((w) => w.window === `claude-${id}`)?.typed).toEqual(['what is left?']);
});

test("a resumed parent stays awake while its predecessor's worker, which reports to it now, runs", async () => {
  const { mesa, store, id, later, home } = await opened();
  mesa.config.set('sessions.sleepAfterMinutes', '30');
  const records = testStore(home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  const before = records.create(() => newSession({ endedAt: IDLE_SINCE, resumedBy: id }));
  const worker = records.create(() => newSession({ parent: before.id }));
  store.update(id, { resumedFrom: before.id });
  later('2026-11-10T12:31:00.000Z');
  expect((await mesa.sessions.sleepIdle()).slept).not.toContain(id);
  records.update(worker.id, { endedAt: '2026-11-10T12:30:00.000Z' });
  expect((await mesa.sessions.sleepIdle()).slept).toContain(id);
});
