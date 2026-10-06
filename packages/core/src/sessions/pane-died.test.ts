import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  fakeTmux,
  fixedClock,
  lockDeps,
  newSession,
  sequentialIds,
  tempDir,
} from '../testing/index.js';
import { recordPaneDied } from './pane-died.js';
import { sessionStore } from './store.js';

const at = '2026-09-24T12:05:00.000Z';
const inWindow = (window: string) =>
  newSession({ tmux: { socket: 'mesa-default', session: 'lantern-cove', window } });

function setUp() {
  const store = sessionStore({
    dir: join(tempDir(), 'sessions'),
    newId: sequentialIds(),
    lock: lockDeps(),
  });
  const clean = store.create(() => inWindow('claude-00000001'));
  const crashed = store.create(() => inWindow('claude-00000002'));
  const killed = store.create(() => inWindow('claude-00000003'));
  // Three panes that died in lantern-cove's tmux session: cleanly, with an error, and killed.
  const tmux = fakeTmux();
  const died = (window: string, status: number, signal?: string) =>
    tmux.addWindow({ project: 'lantern-cove', window, dead: true, status, signal });
  died(clean.tmux.window, 0);
  died(crashed.tmux.window, 1);
  died(killed.tmux.window, 0, 'kill');
  const deps = { store, tmux, clock: fixedClock(at) };
  return { store, deps, clean, crashed, killed };
}

test('a pane that died sets its exit at once: done for status 0, failed otherwise; not stopped', async () => {
  const { store, deps, clean, crashed, killed } = setUp();
  const exited = await recordPaneDied(deps, 'lantern-cove', clean.tmux.window);
  expect(exited).toMatchObject({
    lastState: { state: 'done', confidence: 0.85, at, source: 'tmux-hook' },
    // How it exited, as the dead pane shows it.
    events: [{ type: 'exited', at, status: 0 }],
  });
  // Not stopped: the board still ranks it, shows its last screen, and offers Resume.
  expect(exited?.endedAt).toBeUndefined();
  expect((await recordPaneDied(deps, 'lantern-cove', crashed.tmux.window))?.lastState.state).toBe(
    'failed',
  );
  expect(await recordPaneDied(deps, 'lantern-cove', killed.tmux.window)).toMatchObject({
    lastState: { state: 'failed' },
    events: [{ type: 'exited', at, status: 0, signal: 'kill' }],
  });
  // Once: a second hook for the same pane changes nothing.
  expect(await recordPaneDied(deps, 'lantern-cove', clean.tmux.window)).toBeUndefined();
  expect(store.get(clean.id).events).toEqual([{ type: 'exited', at, status: 0 }]);
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
  expect(exited?.events).toEqual([{ type: 'exited', at, status: 1 }]);
});
