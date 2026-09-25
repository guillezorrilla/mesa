import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  fixedClock,
  newSession,
  SPIKE_LISTING,
  scriptedRunner,
  sequentialIds,
  tempDir,
} from '../testing.js';
import { listAgentProcesses } from './agent-listing.js';
import { listSessions } from './list.js';
import { sessionStore } from './store.js';
import { tmuxBackend } from './tmux.js';

const inWindow = (project: string, startedAt: string, window: string) =>
  newSession({ project, startedAt, tmux: { socket: 'mesa-default', session: project, window } });
const storeIn = () => sessionStore({ dir: join(tempDir(), 'sessions'), newId: sequentialIds() });
const noListing = { listing: async () => [], projects: [], elsewhere: () => new Set<string>() };

test('listSessions marks a session whose window is gone done from tmux, and saves it', async () => {
  const store = storeIn();
  const live = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  const gone = store.create(() => inWindow('tide', '2026-09-24T11:00:00.000Z', 'claude-bbbbbb'));
  const stopped = store.create(() =>
    inWindow('harbor', '2026-09-24T10:00:00.000Z', 'claude-cccccc'),
  );
  store.update(stopped.id, {
    endedAt: '2026-09-24T10:30:00.000Z',
    lastState: { state: 'done', confidence: 1, at: '2026-09-24T10:30:00.000Z', source: 'mesa' },
  });
  const { run, calls } = scriptedRunner({
    tmux: 'lantern-cove\t0\tclaude-aaaaaa\t4242\t2.1.282\t/src/lantern-cove\t1790359178\t0\n',
  });
  const deps = {
    ...noListing,
    store,
    tmux: tmuxBackend({ run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };

  const rows = await listSessions(deps, { all: true });
  const states = rows.map((r) => r.managed && [r.id, r.alive, r.lastState.state, r.runningSeconds]);
  expect(states).toEqual([
    [stopped.id, false, 'done', 1800],
    [gone.id, false, 'done', 3600],
    [live.id, true, 'working', 60],
  ]);
  const marked = {
    state: 'done',
    confidence: 0.85,
    at: '2026-09-24T12:00:00.000Z',
    source: 'tmux',
  };
  expect(store.get(gone.id).lastState).toEqual(marked);
  expect(store.get(stopped.id).lastState.source).toBe('mesa');
  expect(calls).toHaveLength(1);

  // Marked once: the next list writes nothing new, and the clock stays stopped for it.
  const later = { ...deps, clock: fixedClock('2026-09-24T13:00:00.000Z') };
  expect((await listSessions(later)).map((r) => [r.id, r.runningSeconds])).toEqual([
    [stopped.id, 1800],
    [gone.id, 3600],
    [live.id, 3660],
  ]);
  expect(store.get(gone.id).lastState).toEqual(marked);
});

test('a stopped session stays on the board for a day; all shows older ones too', async () => {
  const store = storeIn();
  const old = store.create(() => inWindow('harbor', '2026-09-22T10:00:00.000Z', 'claude-aaaaaa'));
  store.update(old.id, { endedAt: '2026-09-22T10:30:00.000Z' });
  const recent = store.create(() => inWindow('tide', '2026-09-24T10:00:00.000Z', 'claude-bbbbbb'));
  store.update(recent.id, { endedAt: '2026-09-24T10:30:00.000Z' });
  const deps = {
    ...noListing,
    store,
    tmux: tmuxBackend({ run: scriptedRunner().run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };
  expect((await listSessions(deps)).map((r) => r.id)).toEqual([recent.id]);
  expect((await listSessions(deps, { all: true })).map((r) => r.id)).toEqual([old.id, recent.id]);
});

test('an empty board never calls tmux', async () => {
  const { run, calls } = scriptedRunner({}, { missing: ['tmux'] });
  const tmux = tmuxBackend({ run, socket: 'mesa-default', env: {} });
  expect(await listSessions({ ...noListing, store: storeIn(), tmux, clock: fixedClock() })).toEqual(
    [],
  );
  expect(calls).toEqual([]);
});

const SPIKE_ID = SPIKE_LISTING.idle.sessionId;
const listingOf = (...rows: object[]) => {
  const { run } = scriptedRunner({ claude: JSON.stringify(rows) });
  return () => listAgentProcesses(run);
};
/** tmux's line for one window whose pane runs `pid`. */
const windowLine = (project: string, window: string, pid: number) =>
  `${project}\t0\t${window}\t${pid}\t2.1.282\t/src/${project}\t1790359178\t0\n`;

test('a listed process marks the session it runs in: by pane pid, else by agent session id', async () => {
  const store = storeIn();
  // A /clear gave the agent in this window a new session id; its pane pid still names it.
  const cleared = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:00:00.000Z', 'claude-aaaaaa'),
  );
  store.update(cleared.id, { agentSessionId: '00000000-0000-4000-8000-00000000000a' });
  // Resumed: both records hold SP-1's conversation; the listed one is the open, newest one.
  const first = store.create(() => inWindow('harbor', '2026-09-24T11:10:00.000Z', 'claude-cccccc'));
  store.update(first.id, { agentSessionId: SPIKE_ID });
  store.update(first.id, { endedAt: '2026-09-24T11:30:00.000Z', resumedBy: 'zzzzzzzz' });
  const resumed = store.create(() => inWindow('tide', '2026-09-24T11:50:00.000Z', 'claude-bbbbbb'));
  store.update(resumed.id, { agentSessionId: SPIKE_ID });
  const tmux = scriptedRunner({ tmux: windowLine('lantern-cove', 'claude-aaaaaa', 67213) }).run;

  const rows = await listSessions({
    ...noListing,
    store,
    // tide's window is not listed: the listing alone keeps the resumed session alive.
    tmux: tmuxBackend({ run: tmux, socket: 'mesa-default', env: {} }),
    listing: listingOf(SPIKE_LISTING.permission, SPIKE_LISTING.resumed),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows.map((r) => [r.id, r.managed, r.alive, r.agentStatus])).toEqual([
    [cleared.id, true, true, 'waiting'],
    [first.id, true, false, undefined],
    [resumed.id, true, true, 'idle'],
  ]);
  expect(store.get(resumed.id).lastState.state).toBe('working');
});

test('an unmatched process is a foreign row with its project and state; other profiles are left out', async () => {
  const store = storeIn();
  // Stopped: a live process holding its conversation is not this session any more.
  const stopped = store.create(() => newSession({ agentSessionId: SPIKE_ID }));
  store.update(stopped.id, { endedAt: '2026-09-24T12:00:00.000Z' });
  const invented = (pid: number, cwd: string, sessionId: string, more = {}) => ({
    ...SPIKE_LISTING.idle,
    pid,
    cwd,
    sessionId,
    startedAt: Date.parse('2026-09-24T11:59:00.000Z'),
    ...more,
  });
  const rows = await listSessions({
    store,
    tmux: tmuxBackend({ run: scriptedRunner().run, socket: 'mesa-default', env: {} }),
    listing: listingOf(
      SPIKE_LISTING.idle,
      invented(5151, '/elsewhere/tide', '00000000-0000-4000-8000-00000000000b', {
        status: 'busy',
      }),
      invented(6161, '/tmp/scratch', '00000000-0000-4000-8000-00000000000c', {
        status: 'waiting',
        waitingFor: 'input needed',
      }),
      invented(7171, '/src/lantern-cove', '00000000-0000-4000-8000-00000000000d'),
    ),
    projects: [
      { name: 'spike', path: '/private/var/folders/XX/XXXXXXXX/T' },
      { name: 'spike-proj', path: '/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj' },
      { name: 'tide', path: '/src/tide' },
    ],
    // Another profile's session: its board shows it, this one does not.
    elsewhere: () => new Set(['00000000-0000-4000-8000-00000000000d']),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  // By cwd (the innermost project), then by folder name, else none.
  expect(rows.map((r) => [r.id, r.managed, r.project, r.lastState.state])).toEqual([
    [stopped.id, true, 'lantern-cove', 'working'],
    ['ext-5151', false, 'tide', 'working'],
    ['ext-6161', false, null, 'waiting-question'],
    // Started last (and after the clock: no negative running time).
    ['ext-67213', false, 'spike-proj', 'idle'],
  ]);
  expect(rows[3]).toEqual({
    id: 'ext-67213',
    managed: false,
    agent: 'claude',
    pid: 67213,
    cwd: '/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj',
    agentSessionId: SPIKE_ID,
    startedAt: '2026-09-24T19:06:04.032Z',
    project: 'spike-proj',
    alive: true,
    agentStatus: 'idle',
    lastState: {
      state: 'idle',
      confidence: 0.85,
      at: '2026-09-24T12:00:00.000Z',
      source: 'listing',
    },
    runningSeconds: 0,
  });
});

test('a listing that times out adds nothing: records keep their tmux liveness', async () => {
  const store = storeIn();
  const live = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  store.update(live.id, { agentSessionId: SPIKE_ID });
  const { run } = scriptedRunner(
    {
      tmux: windowLine('lantern-cove', 'claude-aaaaaa', 67213),
      claude: JSON.stringify([SPIKE_LISTING.idle]),
    },
    { slow: ['claude'] },
  );
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ run, socket: 'mesa-default', env: {} }),
    listing: () => listAgentProcesses(run),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows).toMatchObject([{ id: live.id, managed: true, alive: true }]);
  expect(rows[0]).not.toHaveProperty('agentStatus');
});
