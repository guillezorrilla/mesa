import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, newSession, scriptedRunner, sequentialIds, tempDir } from '../testing.js';
import { recordPaneDied } from './pane-died.js';
import { sessionStore } from './store.js';
import { tmuxBackend } from './tmux.js';

const at = '2026-09-24T12:05:00.000Z';
const inWindow = (window: string) =>
  newSession({ tmux: { socket: 'mesa-default', session: 'lantern-cove', window } });
/** A list-windows line, as tmux prints Mesa's format, for a pane that died. */
const deadLine = (window: string, status: number, signal = '') =>
  `lantern-cove\t0\t${window}\t4242\tclaude\t/src/lantern-cove\t1790359178\t1\t${status}\t${signal}`;

function setUp() {
  const store = sessionStore({ dir: join(tempDir(), 'sessions'), newId: sequentialIds() });
  const clean = store.create(() => inWindow('claude-00000001'));
  const crashed = store.create(() => inWindow('claude-00000002'));
  const killed = store.create(() => inWindow('claude-00000003'));
  const lines = [
    deadLine(clean.tmux.window, 0),
    deadLine(crashed.tmux.window, 1),
    deadLine(killed.tmux.window, 0, 'kill'),
  ];
  // Only the project's own session lists its windows, as tmux answers: a view's name lists none.
  const { run } = scriptedRunner({
    tmux: (args) => (args.includes('=lantern-cove') || args.includes('-a') ? lines.join('\n') : ''),
  });
  const deps = {
    store,
    tmux: tmuxBackend({ run, socket: 'mesa-default', env: {} }),
    clock: fixedClock(at),
  };
  return { store, deps, clean, crashed, killed };
}

test('a pane that died sets its exit at once: done for status 0, failed otherwise; not stopped', async () => {
  const { store, deps, clean, crashed, killed } = setUp();
  const exited = await recordPaneDied(deps, 'lantern-cove', clean.tmux.window);
  expect(exited).toMatchObject({
    lastState: { state: 'done', confidence: 0.85, at, source: 'tmux-hook' },
    events: [{ type: 'exited', at }],
  });
  // Not stopped: the board still ranks it, shows its last screen, and offers Resume.
  expect(exited?.endedAt).toBeUndefined();
  expect((await recordPaneDied(deps, 'lantern-cove', crashed.tmux.window))?.lastState.state).toBe(
    'failed',
  );
  expect((await recordPaneDied(deps, 'lantern-cove', killed.tmux.window))?.lastState.state).toBe(
    'failed',
  );
  // Once: a second hook for the same pane changes nothing.
  expect(await recordPaneDied(deps, 'lantern-cove', clean.tmux.window)).toBeUndefined();
  expect(store.get(clean.id).events).toEqual([{ type: 'exited', at }]);
});

test("a terminal's view names the pane's session; a window that is not Mesa's is left alone", async () => {
  const { store, deps, clean, crashed } = setUp();
  // tmux names the session last active: a terminal's view of the project, when one is attached.
  expect((await recordPaneDied(deps, '_view-a1b2c3d4', crashed.tmux.window))?.lastState.state).toBe(
    'failed',
  );
  expect(await recordPaneDied(deps, 'tide', clean.tmux.window)).toBeUndefined();
  expect(await recordPaneDied(deps, 'lantern-cove', 'claude-zzzzzzzz')).toBeUndefined();
  expect(await recordPaneDied(deps, 'lantern-cove', 'zsh')).toBeUndefined();
  expect(store.get(clean.id).lastState.source).toBe('mesa');
});

test('a session stopped, or seen exited, first is left alone, even between its read and its write', async () => {
  const { store, deps, clean, crashed } = setUp();
  store.update(clean.id, { endedAt: at });
  expect(await recordPaneDied(deps, 'lantern-cove', clean.tmux.window)).toBeUndefined();
  // A stop lands after the hook read the record: the hook writes nothing over it.
  const stale = store.get(crashed.id);
  store.update(crashed.id, { endedAt: at });
  const racing = { ...deps, store: { ...store, find: () => stale } };
  expect(await recordPaneDied(racing, 'lantern-cove', crashed.tmux.window)).toBeUndefined();
  expect(store.get(crashed.id).events).toEqual([]);
});

test('a look that saw the dead pane first still leaves the exit to the hook', async () => {
  const { store, deps, crashed } = setUp();
  // The board saw it dead a moment before the hook ran.
  const seen = { state: 'failed', confidence: 0.85, at, source: 'tmux' } as const;
  store.update(crashed.id, { lastState: seen });
  const exited = await recordPaneDied(deps, 'lantern-cove', crashed.tmux.window);
  expect(exited).toMatchObject({ lastState: { state: 'failed', source: 'tmux-hook' } });
  expect(exited?.events).toEqual([{ type: 'exited', at }]);
});
