import { existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir, testGit, twoProjects } from '../testing/index.js';

// mesa rm's refusals that read where git has a session's worktree and branch checked out.

const live = (world: ReturnType<typeof twoProjects>['world']) =>
  world.tmux.windows.filter((w) => !w.dead).length;

test("--delete-branch without --delete-worktree is refused while the session's worktree has the branch, before its window closes", async () => {
  const { world, dir, mesa } = twoProjects();
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'kept' });
  const path = result.worktree?.path ?? '';
  await expect(
    mesa.sessions.remove(result.id, { deleteBranch: true, force: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `lantern-cove's branch kept is checked out in the session's worktree at ${path}: pass --delete-worktree too`,
  });
  expect(live(world)).toBe(1);
  expect((await mesa.sessions.show(result.id)).id).toBe(result.id);
  expect(testGit(dir, 'branch', '--list', 'kept')).toBe('+ kept');

  await mesa.sessions.remove(result.id, { deleteBranch: true, deleteWorktree: true, force: true });
  expect(existsSync(path)).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'kept')).toBe('');
});

/** twoProjects with its worktrees under a custom root reached through a symlink. */
function linkedRoot() {
  const made = twoProjects();
  const real = tempDir();
  const link = join(tempDir(), 'worktrees');
  symlinkSync(real, link);
  made.mesa.config.set('worktrees', JSON.stringify({ location: 'custom', customRoot: link }));
  return made;
}

test('a session in the worktree through a symlinked custom root refuses --delete-worktree', async () => {
  const { mesa } = linkedRoot();
  const { result: first } = await mesa.sessions.open('lantern-cove', { branch: 'shared' });
  await mesa.sessions.stop(first.id, true);
  const path = first.worktree?.path ?? '';
  const { result: second } = await mesa.sessions.open('lantern-cove', { checkout: path });
  await expect(mesa.sessions.remove(first.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `session ${second.id} still uses lantern-cove's worktree at ${path}; stop it first`,
  });
  expect(existsSync(path)).toBe(true);
});

test('a worktree through a symlinked custom root whose folder is gone is cleared with its branch', async () => {
  const { dir, mesa } = linkedRoot();
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'gone' });
  await mesa.sessions.stop(result.id, true);
  rmSync(result.worktree?.path ?? '', { recursive: true });
  await mesa.sessions.remove(result.id, { deleteWorktree: true, deleteBranch: true });
  expect(testGit(dir, 'worktree', 'list', '--porcelain')).not.toContain('gone');
  expect(testGit(dir, 'branch', '--list', 'gone')).toBe('');
});
