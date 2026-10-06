import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  fixedClock,
  listingDeps,
  lockDeps,
  newSession,
  plantLiveSession,
  plantTranscript,
  SPIKE_LISTING,
  scriptedRunner,
  sequentialIds,
  tempDir,
  tmuxLine,
} from '../../testing/index.js';
import { listAgentProcesses } from '../agent-listing.js';
import { sessionStore } from '../store.js';
import { tmuxBackend } from '../tmux/backend.js';
import { listSessions } from './board.js';
import { sessionTree } from './tree.js';

const inWindow = (project: string, startedAt: string, window: string) =>
  newSession({ project, startedAt, tmux: { socket: 'mesa-default', session: project, window } });
const storeIn = () =>
  sessionStore({ dir: join(tempDir(), 'sessions'), newId: sequentialIds(), lock: lockDeps() });
/** Board order is attention's; tests about other things read rows oldest first. */
const byStart = <T extends { startedAt: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const LIVE_LINE = `${tmuxLine({ project: 'lantern-cove', window: 'claude-aaaaaa' })}\n`;
/** tmux listing `windows`, with an empty screen for capture-pane. */
const screenless = (windows: string) => (args: string[]) =>
  args.includes('capture-pane') ? '' : windows;
const noSignals = {
  events: () => [],
  priorityOf: () => 0.5,
  faro: { decisions: { backend: 'rules' as const, threshold: 0.7 } },
  env: { CODEX_HOME: tempDir('codex-') },
  home: tempDir(),
};
const noListing = {
  ...noSignals,
  listing: async () => [],
  projects: [],
  elsewhere: () => new Set<string>(),
};

test('a subagent permission hook does not turn its parent into a permission wait', async () => {
  const store = storeIn();
  const parent = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  const { run } = scriptedRunner({ tmux: screenless(LIVE_LINE) });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    events: () => [
      {
        at: '2026-09-24T11:59:50.000Z',
        agent: 'claude',
        event: 'UserPromptSubmit',
        payload: { hook_event_name: 'UserPromptSubmit' },
      },
      {
        at: '2026-09-24T11:59:55.000Z',
        agent: 'claude',
        event: 'PermissionRequest',
        payload: {
          hook_event_name: 'PermissionRequest',
          agent_id: 'agent-lantern',
          tool_name: 'Bash',
        },
      },
    ],
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows).toMatchObject([{ id: parent.id, lastState: { state: 'working' } }]);
  expect(store.get(parent.id).lastState.state).toBe('working');
});

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
  const { run, calls } = scriptedRunner({ tmux: screenless(LIVE_LINE) });
  const deps = {
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };

  const rows = byStart(await listSessions(deps, { all: true }));
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
  // One list-windows, and one capture for the live window no hook or listing speaks for (no
  // pane-died hook here: this backend has no mesa to run).
  expect(calls.map((c) => c.args[5])).toEqual(['list-windows', 'capture-pane']);

  // Marked once: the next list writes nothing new, and the clock stays stopped for it.
  const later = { ...deps, clock: fixedClock('2026-09-24T13:00:00.000Z') };
  expect(byStart(await listSessions(later)).map((r) => [r.id, r.runningSeconds])).toEqual([
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
    tmux: tmuxBackend({
      sleep: async () => {},
      run: scriptedRunner().run,
      socket: 'mesa-default',
      env: {},
    }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };
  expect((await listSessions(deps)).map((r) => r.id)).toEqual([recent.id]);
  expect(byStart(await listSessions(deps, { all: true })).map((r) => r.id)).toEqual([
    old.id,
    recent.id,
  ]);
});

test('an empty board never calls tmux', async () => {
  const { run, calls } = scriptedRunner({}, { missing: ['tmux'] });
  const tmux = tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} });
  expect(await listSessions({ ...noListing, store: storeIn(), tmux, clock: fixedClock() })).toEqual(
    [],
  );
  expect(calls).toEqual([]);
});

const SPIKE_ID = SPIKE_LISTING.idle.sessionId;
const listingOf = (...rows: object[]) => {
  const { run } = scriptedRunner({ claude: JSON.stringify(rows) });
  return () => listAgentProcesses(listingDeps(run));
};
/** tmux's line for one window whose pane runs `pid`. */
const windowLine = (project: string, window: string, pid: number) =>
  `${tmuxLine({ project, window, pid })}\n`;

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
    tmux: tmuxBackend({ sleep: async () => {}, run: tmux, socket: 'mesa-default', env: {} }),
    listing: listingOf(SPIKE_LISTING.permission, SPIKE_LISTING.resumed),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(byStart(rows).map((r) => [r.id, r.managed, r.alive, r.agentStatus])).toEqual([
    [cleared.id, true, true, 'waiting'],
    [first.id, true, false, undefined],
    [resumed.id, true, true, 'idle'],
  ]);
  // Not done: the listing's idle is its state now, and it is saved.
  expect(store.get(resumed.id).lastState).toMatchObject({ state: 'idle', source: 'listing' });
});

test('a /clear moved the agent session id: a look saves the one the listing names for its pane', async () => {
  const store = storeIn();
  const cleared = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:00:00.000Z', 'claude-aaaaaa'),
  );
  store.update(cleared.id, { agentSessionId: '00000000-0000-4000-8000-00000000000a' });
  const deps = {
    ...noListing,
    store,
    tmux: tmuxBackend({
      sleep: async () => {},
      run: scriptedRunner({ tmux: windowLine('lantern-cove', 'claude-aaaaaa', 67213) }).run,
      socket: 'mesa-default',
      env: {},
    }),
    listing: listingOf(SPIKE_LISTING.idle),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };
  const [row] = await listSessions(deps);
  expect(row).toMatchObject({ id: cleared.id, agentSessionId: SPIKE_ID, alive: true });
  expect(store.get(cleared.id)).toMatchObject({
    agentSessionId: SPIKE_ID,
    lastState: { state: 'idle', source: 'listing' },
  });
  // Saved once: the next look finds nothing new to write.
  const saved = store.get(cleared.id);
  await listSessions(deps);
  expect(store.get(cleared.id)).toEqual(saved);
});

test('a /rename in Claude Code is saved as the agent name once, and a later one replaces it', async () => {
  const store = storeIn();
  const session = store.create(() => ({
    ...inWindow('lantern-cove', '2026-09-24T11:00:00.000Z', 'claude-aaaaaa'),
    agentSessionId: SPIKE_ID,
  }));
  const home = tempDir();
  const look = (name: string, nameSource = 'user') => {
    plantLiveSession(home, 67213, { sessionId: SPIKE_ID, name, nameSource });
    const { run } = scriptedRunner({ claude: JSON.stringify([SPIKE_LISTING.idle]) });
    return listSessions({
      ...noListing,
      store,
      tmux: tmuxBackend({
        sleep: async () => {},
        run: scriptedRunner({ tmux: windowLine('lantern-cove', 'claude-aaaaaa', 67213) }).run,
        socket: 'mesa-default',
        env: {},
      }),
      listing: () => listAgentProcesses(listingDeps(run, { home })),
      clock: fixedClock('2026-09-24T12:00:00.000Z'),
    });
  };
  // The name Claude Code derives from the folder is no name.
  await look('lantern-cove-7', 'derived');
  expect(store.get(session.id).agentName).toBeUndefined();
  const [row] = await look('tide-charts');
  expect(row).toMatchObject({ id: session.id, agentName: 'tide-charts' });
  const saved = store.get(session.id);
  await look('tide-charts');
  expect(store.get(session.id)).toEqual(saved);
  await look('harbor-lights');
  expect(store.get(session.id).agentName).toBe('harbor-lights');
});

test("a look reads a live session's context when its state changes, not on every look", async () => {
  const store = storeIn();
  const session = store.create(() => ({
    ...inWindow('lantern-cove', '2026-09-24T11:00:00.000Z', 'claude-aaaaaa'),
    agentSessionId: SPIKE_ID,
  }));
  const home = tempDir();
  const reply = (tokens: number) =>
    plantTranscript(
      home,
      SPIKE_ID,
      '/src/lantern-cove',
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-24T11:59:00.000Z',
        message: { model: 'claude-sonnet-4-20250514', usage: { input_tokens: tokens } },
      }),
    );
  const deps = {
    ...noListing,
    store,
    home,
    tmux: tmuxBackend({
      sleep: async () => {},
      run: scriptedRunner({ tmux: windowLine('lantern-cove', 'claude-aaaaaa', 67213) }).run,
      socket: 'mesa-default',
      env: {},
    }),
    listing: listingOf(SPIKE_LISTING.idle),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };
  reply(50_000);
  // The listing's idle is a new state: its context is read and kept.
  const [row] = await listSessions(deps);
  expect(row).toMatchObject({ context: { used: 25, window: 200_000 } });
  expect(store.get(session.id).context?.used).toBe(25);
  // Still idle, with a reading: the transcript is not read again.
  reply(100_000);
  const [again] = await listSessions(deps);
  expect(again).toMatchObject({ context: { used: 25 } });
  // A new turn changes its state again: the new reading replaces the old one.
  const [next] = await listSessions({ ...deps, listing: listingOf(SPIKE_LISTING.permission) });
  expect(next).toMatchObject({ context: { used: 50 } });
  expect(store.get(session.id).context?.used).toBe(50);
});

test('a Codex listing row gives no state: a foreign one is a guess at working, a Mesa one reads its window', async () => {
  const store = storeIn();
  const codexIn = (window: string, n: number, startedAt: string) =>
    store.create(() =>
      newSession({
        agent: 'codex',
        agentSessionId: `01a0e14e-0000-7000-8000-00000000000${n}`,
        startedAt,
        tmux: { socket: 'mesa-default', session: 'lantern-cove', window },
      }),
    );
  // Both rollouts were written lately. This one's window is gone; the other's shows its prompt.
  const gone = codexIn('codex-aaaaaa', 1, '2026-09-24T11:00:00.000Z');
  const live = codexIn('codex-bbbbbb', 2, '2026-09-24T11:10:00.000Z');
  const listed = (n: number, cwd = '/src/lantern-cove') => ({
    agent: 'codex' as const,
    cwd,
    agentSessionId: `01a0e14e-0000-7000-8000-00000000000${n}`,
    startedAt: '2026-09-24T11:30:00.000Z',
  });
  const idle = '› Ask Codex to do anything\n\n  gpt-6-astra low · /src/lantern-cove';
  const { run } = scriptedRunner({
    tmux: (args) =>
      args.includes('capture-pane')
        ? idle
        : tmuxLine({ project: 'lantern-cove', window: 'codex-bbbbbb', command: 'codex' }),
  });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    listing: async () => [listed(1), listed(2), listed(3, '/src/tide')],
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(byStart(rows)).toMatchObject([
    { id: gone.id, managed: true, alive: false, lastState: { state: 'done', source: 'tmux' } },
    { id: live.id, managed: true, alive: true, lastState: { state: 'idle', source: 'tmux' } },
    {
      id: 'ext-01a0e14e-0000-7000-8000-000000000003',
      managed: false,
      lastState: { state: 'working', confidence: 0.5, source: 'listing' },
    },
  ]);
  expect(rows.map((r) => r.agentStatus)).toEqual([undefined, undefined, undefined]);
});

test('an unmatched process is a foreign row with its project and state; other profiles are left out', async () => {
  const store = storeIn();
  // Stopped: a live process holding its conversation is not this session any more.
  const stopped = store.create(() =>
    newSession({ agentSessionId: SPIKE_ID, startedAt: '2026-09-24T11:00:00.000Z' }),
  );
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
    ...noSignals,
    store,
    tmux: tmuxBackend({
      sleep: async () => {},
      run: scriptedRunner().run,
      socket: 'mesa-default',
      env: {},
    }),
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
  expect(byStart(rows).map((r) => [r.id, r.managed, r.project, r.lastState.state])).toEqual([
    [stopped.id, true, 'lantern-cove', 'working'],
    // Started together: the board's order (attention) stands.
    ['ext-6161', false, null, 'waiting-question'],
    ['ext-5151', false, 'tide', 'working'],
    // Started last (and after the clock: no negative running time).
    ['ext-67213', false, 'spike-proj', 'idle'],
  ]);
  expect(byStart(rows)[3]).toMatchObject({
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
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    listing: () => listAgentProcesses(listingDeps(run)),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows).toMatchObject([{ id: live.id, managed: true, alive: true }]);
  expect(rows[0]).not.toHaveProperty('agentStatus');
});

test('the board sorts by attention: a session waiting on a permission tops a working one', async () => {
  const store = storeIn();
  const busy = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:00:00.000Z', 'claude-aaaaaa'),
  );
  const asking = store.create(() => inWindow('tide', '2026-09-24T11:30:00.000Z', 'claude-bbbbbb'));
  const windows = [
    windowLine('lantern-cove', 'claude-aaaaaa', 4242),
    windowLine('tide', 'claude-bbbbbb', 5151),
  ].join('');
  const { run } = scriptedRunner({ tmux: screenless(windows) });
  const events = (id: string) =>
    id === asking.id
      ? [
          {
            at: '2026-09-24T11:59:55.000Z',
            agent: 'claude' as const,
            event: 'PermissionRequest',
            payload: { hook_event_name: 'PermissionRequest', tool_name: 'Bash' },
          },
        ]
      : [];
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    events,
    // A high-priority project still ranks its working session below a wait.
    priorityOf: (project) => (project === 'lantern-cove' ? 1 : 0),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows.map((r) => [r.id, r.lastState.state, r.lastState.confidence])).toEqual([
    [asking.id, 'waiting-permission', 0.95],
    [busy.id, 'working', 0.95],
  ]);
  // High (0.75), five seconds into its climb to urgent; working at most 0.125.
  expect(rows[0]?.attention).toBeCloseTo(0.762, 3);
  expect(rows[1]?.attention).toBe(0.125);
  expect(store.get(asking.id).lastState).toEqual({
    state: 'waiting-permission',
    confidence: 0.95,
    at: '2026-09-24T11:59:55.000Z',
    source: 'hook',
  });
  expect(rows[0]?.decision?.answers[2]).toMatchObject({ kind: 'Noul', answer: true });
});

test('each row names its parent and children; the tree puts children under their parent', async () => {
  const store = storeIn();
  const at = (minute: number) => `2026-09-24T11:${String(minute).padStart(2, '0')}:00.000Z`;
  const root = store.create(() => newSession({ startedAt: at(0) }));
  const child = store.create(() => newSession({ startedAt: at(10), parent: root.id }));
  const grandchild = store.create(() => newSession({ startedAt: at(20), parent: child.id }));
  const other = store.create(() => newSession({ startedAt: at(30) }));
  // Its parent's record was removed: it lists at the top, its parent kept.
  const parentGone = store.create(() => newSession({ startedAt: at(40), parent: 'gonegone' }));
  const { run } = scriptedRunner({ tmux: '' });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  const links = (id: string) => {
    const row = rows.find((r) => r.id === id);
    return row?.managed ? [row.parent ?? null, row.children] : undefined;
  };
  expect(links(root.id)).toEqual([null, [child.id]]);
  expect(links(child.id)).toEqual([root.id, [grandchild.id]]);
  expect(links(grandchild.id)).toEqual([child.id, []]);
  expect(links(parentGone.id)).toEqual(['gonegone', []]);

  // Board order puts the grandchild first; the tree still nests it under its parent.
  const ranked = [grandchild, other, parentGone, root, child].map((r) =>
    rows.find((x) => x.id === r.id),
  );
  const tree = sessionTree(ranked.filter((r) => r !== undefined));
  expect(tree.map((r) => [r.id, r.depth])).toEqual([
    [other.id, 0],
    [parentGone.id, 0],
    [root.id, 0],
    [child.id, 1],
    [grandchild.id, 2],
  ]);
});

test('children name every record, even one stopped too long ago to be on the board', async () => {
  const store = storeIn();
  const root = store.create(() => newSession({ startedAt: '2026-09-20T10:00:00.000Z' }));
  const old = store.create(() =>
    newSession({ startedAt: '2026-09-20T11:00:00.000Z', parent: root.id }),
  );
  store.update(old.id, {
    endedAt: '2026-09-20T12:00:00.000Z',
    lastState: { state: 'done', confidence: 1, at: '2026-09-20T12:00:00.000Z', source: 'mesa' },
  });
  const { run } = scriptedRunner({ tmux: '' });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows.map((r) => r.id)).toEqual([root.id]);
  expect(rows[0]?.managed && rows[0].children).toEqual([old.id]);
  // Oldest first.
  const young = store.create(() =>
    newSession({ startedAt: '2026-09-24T11:00:00.000Z', parent: root.id }),
  );
  const again = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  const top = again.find((r) => r.id === root.id);
  expect(top?.managed && top.children).toEqual([old.id, young.id]);
});

test('the tree ranks siblings and branches by their highest attention; loops and resumes still place', async () => {
  const store = storeIn();
  store.create(() => newSession());
  const { run } = scriptedRunner({ tmux: '' });
  const [base] = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  if (!base?.managed) throw new Error('expected a managed row');
  const row = (
    id: string,
    attention: number,
    links: { parent?: string; resumedFrom?: string } = {},
  ) => ({ ...base, id, attention, ...links });
  const tree = (rows: ReturnType<typeof row>[]) =>
    sessionTree(rows).map((r) => `${r.depth}:${r.id}`);

  // Siblings by attention; a quiet parent with a waiting grandchild outranks a busier root.
  expect(
    tree([
      // In board order (attention), which the tree must rearrange.
      row('busyroot', 0.4),
      row('childtop', 0.2, { parent: 'quietrot' }),
      row('childlow', 0.1, { parent: 'quietrot' }),
      row('quietrot', 0.05),
      row('waitsnow', 0.9, { parent: 'childlow' }),
    ]),
  ).toEqual(['0:quietrot', '1:childlow', '2:waitsnow', '1:childtop', '0:busyroot']);

  // Ties keep the board's order.
  expect(tree([row('firstsss', 0.3), row('secondss', 0.3)])).toEqual(['0:firstsss', '0:secondss']);

  // A loop of hand-edited records, and one that is its own parent, still show, at the top; a
  // loop row with two children ranks them without looping forever.
  expect(
    tree([
      row('loopaaaa', 0.3, { parent: 'loopbbbb' }),
      row('loopbbbb', 0.2, { parent: 'loopaaaa' }),
      row('loopkidb', 0.1, { parent: 'loopaaaa' }),
      row('selfself', 0.1, { parent: 'selfself' }),
    ]),
    // Its own parent counts as none; a loop has no top, so it follows the rows that do.
  ).toEqual(['0:selfself', '0:loopaaaa', '1:loopbbbb', '1:loopkidb']);

  // Its parent was resumed, twice: the child sits under the newest resume, off the board or on it.
  expect(
    tree([
      row('resumed2', 0.3, { resumedFrom: 'resumed1' }),
      row('resumed1', 0.25, { resumedFrom: 'original' }),
      row('original', 0.25),
      row('childofo', 0.2, { parent: 'original' }),
    ]),
  ).toEqual(['0:resumed2', '1:childofo', '0:resumed1', '0:original']);
});

test('a record another process holds locked still shows its new state, and the board still lists', async () => {
  const dir = join(tempDir(), 'sessions');
  const store = sessionStore({ dir, newId: sequentialIds(), lock: lockDeps() });
  const gone = store.create(() => inWindow('tide', '2026-09-24T11:00:00.000Z', 'claude-bbbbbb'));
  // A lock left by a killed mesa.
  writeFileSync(join(dir, `${gone.id}.json.lock`), 'a killed mesa');
  const { run } = scriptedRunner({ tmux: '' });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(rows.map((r) => [r.id, r.lastState.state])).toEqual([[gone.id, 'done']]);
  // Not written, and not waited for: the record keeps its old state until the lock is gone.
  expect(store.get(gone.id).lastState.state).toBe('working');
  const started = Date.now();
  await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(Date.now() - started).toBeLessThan(500);
});

test('a look that read a session before a stop never writes its state over the stop', async () => {
  const store = storeIn();
  const live = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  // The look reads the record live; a stop lands before the look saves.
  const before = store.list();
  const stopped = {
    state: 'done',
    confidence: 1,
    at: '2026-09-24T12:00:00.000Z',
    source: 'mesa',
  } as const;
  store.update(live.id, { endedAt: '2026-09-24T12:00:00.000Z', lastState: stopped });
  // Its window is gone, so the look has a new state to save: done, from tmux.
  const { run } = scriptedRunner({ tmux: '' });
  await listSessions({
    ...noListing,
    store: { ...store, list: () => before },
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(store.get(live.id).lastState).toEqual(stopped);
});

test('a look that read a session before another look saved its state never writes over it', async () => {
  const store = storeIn();
  const live = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  // A look reads the record; another mesa's look beside it saves first.
  const before = store.list();
  const saved = {
    state: 'waiting-question',
    confidence: 0.95,
    at: '2026-09-24T12:00:00.000Z',
    source: 'hook',
  } as const;
  store.update(live.id, { lastState: saved });
  const { run } = scriptedRunner({ tmux: '' });
  await listSessions({
    ...noListing,
    store: { ...store, list: () => before },
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  expect(store.get(live.id).lastState).toEqual(saved);
});

test("a record an older Mesa saved with the adapter's state loads, and a look replaces it with the rules", async () => {
  const store = storeIn();
  const live = store.create(() =>
    inWindow('lantern-cove', '2026-09-24T11:59:00.000Z', 'claude-aaaaaa'),
  );
  store.update(live.id, {
    lastState: {
      state: 'waiting-question',
      confidence: 0.9,
      at: '2026-09-24T11:59:30.000Z',
      source: 'adapter',
      basis: '0123456789abcdef',
    },
  });
  // No hook or listing speaks: the screen, a finished reply, is the rules' only signal.
  const screen = ['⏺ Wrote tide-tables.md', '', '─────', '❯', '─────'].join('\n');
  const { run } = scriptedRunner({
    tmux: (args) => (args.includes('capture-pane') ? screen : LIVE_LINE),
  });
  const rows = await listSessions({
    ...noListing,
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  });
  const read = { state: 'idle', confidence: 0.6, at: '2026-09-24T12:00:00.000Z', source: 'tmux' };
  expect(rows).toMatchObject([{ id: live.id, lastState: read }]);
  expect(store.get(live.id).lastState).toEqual(read);
});
