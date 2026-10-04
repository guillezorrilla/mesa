import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  agentWorld,
  CLAUDE_MOUNT,
  CODEX_MOUNT,
  gitRepo,
  isolateGit,
  projectProfile,
  steppingClock,
  testGit,
  twoProjects,
  withRealGit,
  worktreeAt,
} from '../testing/index.js';

isolateGit({ beforeAll, afterAll });

test('Claude fork keeps the source and opens a new native conversation in the chosen checkout', async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(withRealGit(world.run));
  gitRepo(dir);
  const source = (await mesa.sessions.open('lantern-cove', { mode: 'plan' })).result;
  const same = (await mesa.sessions.fork(source.id)).result;
  expect(same).toMatchObject({ parent: source.id, agent: 'claude', mode: 'plan', cwd: dir });
  expect(same.agentSessionId).toBeUndefined();
  expect(world.tmux.windows.at(-1)).toMatchObject({
    path: dir,
    launch: `unset NO_COLOR; exec claude --resume '${source.agentSessionId}' --fork-session --permission-mode plan ${CLAUDE_MOUNT}`,
  });
  const separate = (await mesa.sessions.fork(source.id, { branch: 'try/fork' })).result;
  expect(separate).toMatchObject({ parent: source.id, worktree: { branch: 'try/fork' } });
  expect(world.tmux.windows.at(-1)).toMatchObject({
    path: separate.worktree?.path,
    launch: `unset NO_COLOR; exec claude --resume '${source.agentSessionId}' --fork-session --permission-mode plan ${CLAUDE_MOUNT}`,
  });
  expect((await mesa.sessions.show(source.id)).endedAt).toBeUndefined();
  expect((await mesa.sessions.show(source.id)).resumedBy).toBeUndefined();
  await expect(mesa.sessions.fork(source.id, { base: 'main' })).rejects.toMatchObject({
    code: 'usage',
  });
});

test('Codex fork uses its native thread and refuses unqualified sources', async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(world.run, {
    env: world.codex.env,
    clock: steppingClock('2026-09-24T12:00:00.000Z'),
  });
  const source = (await mesa.sessions.open('lantern-cove', { agent: 'codex' })).result;
  await expect(mesa.sessions.fork(source.id)).rejects.toMatchObject({ code: 'not_found' });
  const nativeId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  world.codex.rollout({
    id: nativeId,
    cwd: dir,
    startedAt: new Date(Date.parse(source.startedAt) + 1).toISOString(),
  });
  expect((await mesa.sessions.show(source.id)).agentSessionId).toBe(nativeId);
  const fork = (await mesa.sessions.fork(source.id)).result;
  expect(fork).toMatchObject({ parent: source.id, cwd: dir, agent: 'codex' });
  expect(world.tmux.windows.at(-1)?.launch).toBe(
    `codex -c mesa.embedded=true ${CODEX_MOUNT} fork '${nativeId}' -C '${dir}'`,
  );
  const terminal = (await mesa.sessions.open('lantern-cove', { terminal: true })).result;
  await expect(mesa.sessions.fork(terminal.id)).rejects.toMatchObject({ code: 'usage' });
  const agy = (await mesa.sessions.open('lantern-cove', { agent: 'antigravity' })).result;
  await expect(mesa.sessions.fork(agy.id)).rejects.toMatchObject({ code: 'usage' });
});

test('a source worktree cannot be deleted while its fork still runs there', async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(withRealGit(world.run));
  gitRepo(dir);
  const source = (await mesa.sessions.open('lantern-cove', { branch: 'fork-source' })).result;
  const fork = (await mesa.sessions.fork(source.id)).result;
  expect(fork.cwd).toBe(source.worktree?.path);
  await mesa.sessions.stop(source.id, true);
  await expect(mesa.sessions.remove(source.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining(fork.id),
  });
});

test('a new fork branch starts at the source checkout HEAD, while an existing branch stays put', async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(withRealGit(world.run));
  gitRepo(dir);
  const source = (await mesa.sessions.open('lantern-cove', { branch: 'source' })).result;
  const sourcePath = source.worktree?.path ?? '';
  testGit(sourcePath, 'commit', '--allow-empty', '-m', 'source progress');
  const fork = (await mesa.sessions.fork(source.id, { branch: 'from-source' })).result;
  expect(fork.worktree?.base).toBe(testGit(sourcePath, 'rev-parse', 'HEAD'));
  expect(testGit(fork.worktree?.path ?? '', 'rev-parse', 'HEAD')).toBe(
    testGit(sourcePath, 'rev-parse', 'HEAD'),
  );
  testGit(dir, 'branch', 'existing', 'main');
  const existing = (await mesa.sessions.fork(source.id, { branch: 'existing' })).result;
  expect(existing.worktree?.base).toBeUndefined();
  expect(testGit(existing.worktree?.path ?? '', 'rev-parse', 'HEAD')).toBe(
    testGit(dir, 'rev-parse', 'main'),
  );
});

test('a fork across projects needs --branch, and gives every project a worktree from where its source stands', async () => {
  const { world, home, mesa } = twoProjects();
  const source = (
    await mesa.sessions.open('lantern-cove', { with: ['tide-pool'], branch: 'source' })
  ).result;
  await expect(mesa.sessions.fork(source.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${source.id} works in several projects: pass --branch so its fork gets worktrees of its own`,
  });
  const own = source.worktree?.path ?? '';
  const other = source.additional?.[0]?.worktree.path ?? '';
  testGit(other, 'commit', '--allow-empty', '-m', 'tide progress');
  const head = (dir: string) => testGit(dir, 'rev-parse', 'HEAD');

  const fork = (await mesa.sessions.fork(source.id, { branch: 'try/x' })).result;
  const forked = worktreeAt(home, 'tide-pool', 'try-x');
  expect(fork).toMatchObject({
    parent: source.id,
    worktree: { path: worktreeAt(home, 'lantern-cove', 'try-x'), branch: 'try/x', base: head(own) },
  });
  expect(fork.additional).toEqual([
    { project: 'tide-pool', worktree: { path: forked, branch: 'try/x', base: head(other) } },
  ]);
  expect(head(fork.worktree?.path ?? '')).toBe(head(own));
  expect(head(forked)).toBe(head(other));
  const window = world.tmux.windows.find((w) => w.window === `claude-${fork.id}`);
  expect(window).toMatchObject({ path: fork.worktree?.path });
  expect(window?.launch).toContain(`--fork-session`);
  expect(window?.launch).toContain(`'--add-dir=${forked}'`);
});
