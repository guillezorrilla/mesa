import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { testGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('show, rename, and rm, as the issue types them: sessions shows the name, rm refuses a live one', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect((await mesa('show', id, '--json')).json.data).toMatchObject({ id, alive: true });
  expect((await mesa('show', id)).stdout).toMatch(/^project: lantern-cove$/m);
  expect(await mesa('show', 'zzzzzzzz')).toMatchObject({ code: 3 });

  expect((await mesa('rename', id, 'rm test')).stdout).toBe(`renamed ${id} to rm test\n`);
  expect((await mesa('sessions')).stdout.split('\n')[0]).toMatch(/^rm test {2}lantern-cove/);
  expect((await mesa('sessions', '--json')).json.data[0]).toMatchObject({ id, name: 'rm test' });

  expect(await mesa('rm', id)).toMatchObject({
    code: 2,
    stderr: `session ${id} is live: mesa stop ${id} first, or pass --force to close its window\n`,
  });
  const removed = await mesa('rm', id, '--force', '--json');
  expect(removed.json.data).toMatchObject({ id, record: true, window: true });
  expect(await mesa('show', id)).toMatchObject({ code: 3 });
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');
});

test('rm --delete-worktree across projects: --json lists additional; a dirty one refuses (2) and keeps all', async () => {
  const { tmux, tide } = await cli.withTwoProjects();
  /** A session across both projects whose agent has exited, its pane dead. */
  const ended = async () => {
    const data = (await mesa('open', 'lantern-cove', '--with', 'tide-pool', '--worktree', '--json'))
      .json.data;
    const w = tmux.windows.find((x) => x.window === `claude-${data.id}`);
    if (w) w.dead = true;
    return data;
  };
  const clean = await ended();
  const other = clean.additional[0].worktree;
  const removed = await mesa('rm', clean.id, '--delete-worktree', '--delete-branch', '--json');
  expect(removed.code, removed.stdout).toBe(0);
  expect(removed.json.data).toMatchObject({
    worktree: clean.worktree.path,
    branch: clean.worktree.branch,
    additional: [{ project: 'tide-pool', worktree: other.path, branch: other.branch }],
  });
  expect(existsSync(other.path)).toBe(false);
  expect(testGit(tide, 'branch', '--list', other.branch)).toBe('');

  const dirty = await ended();
  const path = dirty.additional[0].worktree.path;
  writeFileSync(join(path, 'notes.md'), 'unsaved\n');
  const refused = await mesa('rm', dirty.id, '--delete-worktree', '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error.message).toBe(
    `tide-pool's worktree at ${path} has changes or untracked files: commit or remove them, or pass --force`,
  );
  expect([existsSync(dirty.worktree.path), existsSync(path)]).toEqual([true, true]);
  expect((await mesa('show', dirty.id)).code).toBe(0);
  expect((await mesa('rm', dirty.id, '--delete-worktree', '--force')).stdout).toBe(
    `removed ${dirty.id}, with its window, worktree ${dirty.worktree.path}, tide-pool's worktree ${path}\n`,
  );
});
