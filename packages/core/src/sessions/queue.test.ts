import { expect, test } from 'vitest';
import { vaultServer } from '../agents/vault-mount.js';
import { profilePaths } from '../profile/paths.js';
import { openProfile } from '../profile/profile.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  fixedClock,
  projectProfile,
  scriptedRunner,
  sequentialUuids,
  testStore,
} from '../testing/index.js';
import { startQueued } from './queue.js';
import { tmuxBackend } from './tmux/backend.js';

const now = '2026-09-24T12:00:00.000Z';

/** A queued session after a running one, and the deps that start it; `claude` false: none installed. */
async function setUp({ claude = true } = {}) {
  const world = fakeTmux();
  const answers = { claude: CLAUDE_VERSION, tmux: world.answer };
  const { home, mesa } = projectProfile(scriptedRunner(answers).run);
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (await mesa.sessions.open('lantern-cove', { after: a.id })).result;
  const { run } = scriptedRunner(answers, { missing: claude ? [] : ['claude'] });
  const store = testStore(home);
  const deps = {
    profile: openProfile(profilePaths(home, 'default')),
    profileName: 'default',
    store,
    tmux: tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }),
    run,
    env: {},
    home,
    self: ['/usr/local/bin/mesa'],
    clock: fixedClock(now),
    newUuid: sequentialUuids(),
    caller: () => ({ inMesaWindow: false }),
    syncSkills: () => {},
    vaultServer: vaultServer(['/usr/local/bin/mesa']),
  };
  const windows = () => world.windows.filter((w) => w.window === `claude-${b.id}`);
  return { deps, store, b, windows };
}

test('of two starts at once, one starts it and the other finds it claimed', async () => {
  const { deps, b, windows } = await setUp();
  const [first, second] = await Promise.all([startQueued(deps, b.id), startQueued(deps, b.id)]);
  expect(first?.record).toMatchObject({ id: b.id, lastState: { state: 'idle' }, startedAt: now });
  expect(first?.record.pending).toBeUndefined();
  expect(second).toBeUndefined();
  expect(windows()).toHaveLength(1);
  // Started, it is no longer queued: a later signal does nothing.
  expect(await startQueued(deps, b.id)).toBeUndefined();
});

test('a claim is left alone for 30 s, then taken again: a start killed mid-way is retried', async () => {
  const { deps, store, b, windows } = await setUp();
  const claimed = (at: string) => store.update(b.id, { pending: { claimedAt: at } });
  claimed('2026-09-24T11:59:31.000Z');
  expect(await startQueued(deps, b.id)).toBeUndefined();
  claimed('2026-09-24T11:59:30.000Z');
  expect((await startQueued(deps, b.id))?.record.lastState.state).toBe('idle');
  expect(windows()).toHaveLength(1);
});

test('a stale completion signal cannot start a session after its wait target changed', async () => {
  const { deps, store, b, windows } = await setUp();
  store.update(b.id, { after: 'newwait1' });
  expect(await startQueued(deps, b.id, b.after)).toBeUndefined();
  expect(windows()).toHaveLength(0);
  expect((await startQueued(deps, b.id, 'newwait1'))?.record.lastState.state).toBe('idle');
});

test('a start retried after one killed once its window opened keeps that window and its id', async () => {
  const { deps, store, b, windows } = await setUp();
  // The killed start: claimed with its id, its window open, the record never finished.
  const agentSessionId = '00000000-0000-4000-8000-0000000000aa';
  store.update(b.id, { agentSessionId, pending: { claimedAt: '2026-09-24T11:59:00.000Z' } });
  const record = store.get(b.id);
  await deps.tmux.openWindow({
    project: 'lantern-cove',
    window: record.tmux.window,
    cwd: deps.profile.paths.worktrees,
    command: 'claude',
    env: {},
  });
  expect((await startQueued(deps, b.id))?.record).toMatchObject({
    agentSessionId,
    lastState: { state: 'idle' },
  });
  expect(windows()).toHaveLength(1);
});

test('a start that fails leaves it failed and ended, with no conversation to resume', async () => {
  const { deps, store, b, windows } = await setUp({ claude: false });
  await expect(startQueued(deps, b.id)).rejects.toMatchObject({ code: 'agent_unavailable' });
  const failed = store.get(b.id);
  expect(failed).toMatchObject({
    endedAt: now,
    lastState: { state: 'failed', confidence: 1, source: 'mesa' },
  });
  expect(failed.pending).toBeUndefined();
  expect(failed.agentSessionId).toBeUndefined();
  expect(windows()).toHaveLength(0);
});
