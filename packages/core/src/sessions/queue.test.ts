import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import { vaultServer } from '../agents/vault-mount.js';
import { profilePaths } from '../profile/paths.js';
import { openProfile } from '../profile/profile.js';
import {
  agentWorld,
  CLAUDE_VERSION,
  fakeTmux,
  fixedClock,
  gitProject,
  gitRepo,
  lockDeps,
  projectProfile,
  repoState,
  scriptedRunner,
  sequentialUuids,
  testGit,
  testStore,
  twoProjects,
  withRealGit,
  worktreeAt,
} from '../testing/index.js';
import { startQueued } from './queue.js';

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
    tmux: world,
    run,
    env: {},
    home,
    self: ['/usr/local/bin/mesa'],
    clock: fixedClock(now),
    newUuid: sequentialUuids(),
    caller: () => ({ inMesaWindow: false }),
    syncSkills: () => {},
    vaultServer: vaultServer(['/usr/local/bin/mesa']),
    lock: { ...lockDeps(), sleep: async () => {} },
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

test('a queued --with session has no worktree while queued, and one in each project once its target ends', async () => {
  const { world, home, mesa } = twoProjects();
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (
    await mesa.sessions.open('lantern-cove', { after: a.id, with: ['tide-pool'], branch: 'shared' })
  ).result;
  expect(b).toMatchObject({
    lastState: { state: 'queued' },
    pending: { branch: 'shared', with: ['tide-pool'] },
  });
  expect(b.worktree).toBeUndefined();
  expect(b.additional).toBeUndefined();
  for (const project of ['lantern-cove', 'tide-pool'])
    expect(existsSync(worktreeAt(home, project, 'shared'))).toBe(false);

  await mesa.sessions.stop(a.id, true);
  const started = await mesa.sessions.show(b.id);
  expect(started.lastState.state).not.toBe('queued');
  expect(started.pending).toBeUndefined();
  expect(started.worktree?.path).toBe(worktreeAt(home, 'lantern-cove', 'shared'));
  const tide = worktreeAt(home, 'tide-pool', 'shared');
  expect(started.additional).toEqual([
    { project: 'tide-pool', worktree: { path: tide, branch: 'shared', base: 'main' } },
  ]);
  expect(existsSync(tide)).toBe(true);
  const window = world.tmux.windows.find((w) => w.window === `claude-${b.id}`);
  expect(window?.launch).toContain(`'--add-dir=${tide}'`);
});

test('a queued --with start failing on the second repo leaves it failed and both repos as they were', async () => {
  const { dir, tide, mesa } = twoProjects();
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (
    await mesa.sessions.open('lantern-cove', { after: a.id, with: ['tide-pool'], branch: 'shared' })
  ).result;
  // The branch is checked out in tide-pool by the time it starts: its worktree cannot be added.
  testGit(tide, 'checkout', '-q', '-b', 'shared');
  const before = { alpha: repoState(dir), beta: repoState(tide) };
  await mesa.sessions.stop(a.id, true);
  const failed = await mesa.sessions.show(b.id);
  expect(failed).toMatchObject({ lastState: { state: 'failed' } });
  expect(failed.endedAt).toBeDefined();
  expect(failed.worktree).toBeUndefined();
  expect(failed.additional).toBeUndefined();
  expect({ alpha: repoState(dir), beta: repoState(tide) }).toEqual(before);
});

test('a queued --with start whose window fails keeps the worktree its setup ran in on the record, and the other repo as it was', async () => {
  const world = agentWorld();
  const run = withRealGit(world.run);
  const mesaYaml = 'name: lantern-cove\nworktrees:\n  setup: [/usr/bin/touch, keep.txt]\n';
  const { home, dir, mesa } = projectProfile(run, { mesaYaml });
  gitRepo(dir);
  const tide = gitProject(mesa, home, 'tide-pool');
  const pending = Object.values(mesa.projects.pending('lantern-cove'));
  mesa.projects.trust(
    'lantern-cove',
    pending.map((script) => script.fingerprint),
  );
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (
    await mesa.sessions.open('lantern-cove', { after: a.id, with: ['tide-pool'], branch: 'shared' })
  ).result;
  // The queued session's window, the next one to open, is the one tmux refuses.
  world.tmux.failing = ['new-session', 'new-window'];
  const before = repoState(tide);
  await mesa.sessions.stop(a.id, true);
  const failed = await mesa.sessions.show(b.id);
  expect(failed.lastState.state).toBe('failed');
  const kept = worktreeAt(home, 'lantern-cove', 'shared');
  expect(existsSync(kept)).toBe(true);
  expect(failed.worktree).toEqual({ path: kept, branch: 'shared', base: 'main' });
  expect(failed.additional).toBeUndefined();
  expect(repoState(tide)).toEqual(before);
});

test('a queued --with start retried after a kill takes the worktrees already on its record', async () => {
  const { home, dir, tide, mesa } = twoProjects();
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (
    await mesa.sessions.open('lantern-cove', { after: a.id, with: ['tide-pool'], branch: 'shared' })
  ).result;
  // The killed start made both worktrees and wrote them to the record, then its claim went stale.
  const own = worktreeAt(home, 'lantern-cove', 'shared');
  const other = worktreeAt(home, 'tide-pool', 'shared');
  testGit(dir, 'worktree', 'add', '-q', '-b', 'shared', own);
  testGit(tide, 'worktree', 'add', '-q', '-b', 'shared', other);
  testStore(home).update(b.id, (r) => ({
    worktree: { path: own, branch: 'shared', base: 'main' },
    additional: [
      { project: 'tide-pool', worktree: { path: other, branch: 'shared', base: 'main' } },
    ],
    pending: { ...r.pending, claimedAt: '2026-01-01T00:00:00.000Z' },
  }));
  await mesa.sessions.stop(a.id, true);
  const started = await mesa.sessions.show(b.id);
  expect(started.lastState.state).toBe('idle');
  expect(started.additional).toEqual([
    { project: 'tide-pool', worktree: { path: other, branch: 'shared', base: 'main' } },
  ]);
});

test("a read-only profile's queued Codex --with session says it gets workspace-write at its start", async () => {
  const { world, mesa } = twoProjects();
  mesa.config.set('agents.codex.sandbox', 'read-only');
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (
    await mesa.sessions.open('lantern-cove', {
      agent: 'codex',
      after: a.id,
      with: ['tide-pool'],
      branch: 'shared',
    })
  ).result;
  expect(world.tmux.windows.some((w) => w.window === `codex-${b.id}`)).toBe(false);

  const { warning } = await mesa.sessions.stop(a.id, true);
  expect(warning).toContain(
    'Codex runs read-only in this profile; this session gets workspace-write so it can change the other projects',
  );
  const window = world.tmux.windows.find((w) => w.window === `codex-${b.id}`);
  expect(window?.launch).toContain(' --sandbox=workspace-write ');
});
