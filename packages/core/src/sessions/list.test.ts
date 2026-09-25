import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, newSession, scriptedRunner, sequentialIds, tempDir } from '../testing.js';
import { listSessions } from './list.js';
import { sessionStore } from './store.js';
import { tmuxBackend } from './tmux.js';

const inWindow = (project: string, startedAt: string, window: string) =>
  newSession({ project, startedAt, tmux: { socket: 'mesa-default', session: project, window } });
const storeIn = () => sessionStore({ dir: join(tempDir(), 'sessions'), newId: sequentialIds() });

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
    store,
    tmux: tmuxBackend({ run, socket: 'mesa-default', env: {} }),
    clock: fixedClock('2026-09-24T12:00:00.000Z'),
  };

  const rows = await listSessions(deps, { all: true });
  expect(rows.map((r) => [r.id, r.alive, r.lastState.state, r.runningSeconds])).toEqual([
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
  expect(await listSessions({ store: storeIn(), tmux, clock: fixedClock() })).toEqual([]);
  expect(calls).toEqual([]);
});
