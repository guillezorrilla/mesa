import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { profilePaths } from '../profile/paths.js';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  gitRepo,
  isolateGit,
  plantOutputLog,
  projectProfile,
  scriptedRunner,
  testGit,
  withRealGit,
} from '../testing/index.js';

isolateGit({ beforeAll, afterAll });

/** lantern-cove as a git repository, in a profile over a fake tmux with the real git. */
function setUp() {
  const world = fakeTmux();
  const scripted = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION });
  const made = projectProfile(withRealGit(scripted.run));
  gitRepo(made.dir);
  const exit = (window: string) => {
    const w = world.windows.find((x) => x.window === window);
    if (w) w.dead = true;
  };
  return { ...made, world, exit };
}

test('show prints the record with alive; an unknown id is not_found', async () => {
  const { mesa, exit } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  expect(await mesa.sessions.show(result.id)).toMatchObject({ id: result.id, alive: true });
  exit(result.tmux.window);
  // A dead pane's window still exists: alive, as the board counts it, until it is gone.
  expect((await mesa.sessions.show(result.id)).alive).toBe(true);
  await expect(mesa.sessions.show('zzzzzzzz')).rejects.toMatchObject({ code: 'not_found' });
});

test('rename stores the name and the board carries it; a blank one is refused', async () => {
  const { home, mesa } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  const { result: renamed, receipt } = mesa.sessions.rename(result.id, '  tide tables ');
  expect(renamed.name).toBe('tide tables');
  const [row] = await mesa.sessions.list();
  expect(row).toMatchObject({ id: result.id, name: 'tide tables' });
  expect(listReceipts(join(home, 'vault'), 1)[0]?.receipt).toMatchObject({
    id: receipt?.id,
    type: 'session',
    outputs: { name: 'tide tables' },
  });
  expect(() => mesa.sessions.rename(result.id, ' ')).toThrow(
    expect.objectContaining({ code: 'usage', message: 'the name is empty' }),
  );
});

test('rm refuses a live session; --force closes its window, then removes the record and logs', async () => {
  const { home, mesa, world } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  const events = join(profilePaths(home, 'default').events, `${result.id}.jsonl`);
  mkdirSync(profilePaths(home, 'default').events, { recursive: true });
  writeFileSync(events, '{}\n');
  const output = plantOutputLog(home, result.id, 'Reading the tide tables\n');
  await expect(mesa.sessions.remove(result.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${result.id} is live: mesa stop ${result.id} first, or pass --force to close its window`,
  });
  expect(world.windows).toHaveLength(1);
  const { result: removed, receipt } = await mesa.sessions.remove(result.id, { force: true });
  expect(removed).toEqual({
    id: result.id,
    project: 'lantern-cove',
    record: true,
    events: true,
    outputLog: true,
    window: true,
  });
  expect(world.windows).toEqual([]);
  expect(existsSync(events)).toBe(false);
  expect(existsSync(output)).toBe(false);
  await expect(mesa.sessions.show(result.id)).rejects.toMatchObject({ code: 'not_found' });
  expect(listReceipts(join(home, 'vault'), 1)[0]?.receipt).toMatchObject({
    id: receipt?.id,
    session: result.id,
    project: 'lantern-cove',
  });
});

test('--delete-worktree removes a clean worktree, refuses a dirty one unless --force; --delete-branch deletes it', async () => {
  const { dir, mesa, exit } = setUp();
  const { result: clean } = await mesa.sessions.open('lantern-cove', { branch: 'clean' });
  exit(clean.tmux.window);
  const path = clean.worktree?.path ?? '';
  const { result } = await mesa.sessions.remove(clean.id, {
    deleteWorktree: true,
    deleteBranch: true,
  });
  expect(result).toMatchObject({ worktree: path, branch: 'clean', window: true });
  expect(existsSync(path)).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'clean')).toBe('');

  const { result: dirty } = await mesa.sessions.open('lantern-cove', { branch: 'dirty' });
  exit(dirty.tmux.window);
  writeFileSync(join(dirty.worktree?.path ?? '', 'notes.md'), 'unsaved\n');
  await expect(mesa.sessions.remove(dirty.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(/^cannot remove the worktree .*dirty: fatal: .*untracked files/),
  });
  // Refused before the record went: it is still there to retry.
  expect((await mesa.sessions.show(dirty.id)).worktree?.branch).toBe('dirty');
  await mesa.sessions.remove(dirty.id, { deleteWorktree: true, force: true });
  expect(existsSync(dirty.worktree?.path ?? '')).toBe(false);
  // The branch stays without --delete-branch.
  expect(testGit(dir, 'branch', '--list', 'dirty')).toBe('dirty');

  const { result: plain } = await mesa.sessions.open('lantern-cove');
  await expect(
    mesa.sessions.remove(plain.id, { force: true, deleteBranch: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `session ${plain.id} has no worktree or branch of its own`,
  });
});

test('rm of a session resumed since leaves the worktree the newer session has', async () => {
  const { mesa, exit } = setUp();
  const { result: first } = await mesa.sessions.open('lantern-cove', { branch: 'kept' });
  exit(first.tmux.window);
  const { result: resumed } = await mesa.sessions.resume(first.id);
  await expect(mesa.sessions.remove(first.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `the worktree at ${first.worktree?.path} is session ${resumed.record.id}'s now; remove that one instead`,
  });
  // Without the flag, the old record goes and the worktree stays with the new one.
  await mesa.sessions.remove(first.id);
  expect(existsSync(first.worktree?.path ?? '')).toBe(true);
});
