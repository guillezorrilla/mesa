import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execRunner } from '@mesa/core';
import { isolateGit, withRealGit } from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

test('git status uses the registered checkout, linked worktrees, and literal NUL paths', async () => {
  const repo = join(cli.home, 'lantern-cove');
  const linked = join(cli.home, 'feature checkout');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', repo]);
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  await cli.mesa('register', '--create', repo);
  writeFileSync(join(repo, 'before.txt'), 'before\n');
  writeFileSync(join(repo, 'README.md'), 'old\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'first',
  ]);
  execFileSync('git', ['-C', repo, 'mv', 'before.txt', 'after\nname.txt']);
  writeFileSync(join(repo, 'README.md'), 'new\n');
  writeFileSync(join(repo, 'untracked space.txt'), 'new\n');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', linked]);

  const native = cli.run;
  cli.run = async (file, args, timeout) => {
    if (file !== 'git') return native(file, args, timeout);
    const result = await execRunner(file, args, timeout);
    if (result.ok && args.slice(-4).join(' ') === 'worktree list --porcelain -z') {
      return {
        ok: true,
        stdout: `${result.stdout}worktree ${join(cli.home, 'stale')}\0prunable gone\0\0`,
      };
    }
    return result;
  };

  const root = await cli.mesa('git', 'status', 'lantern-cove', '--json');
  expect(root.code).toBe(0);
  expect(root.json.data).toMatchObject({
    checkout: { project: 'lantern-cove', path: repo, registered: true },
    changes: expect.arrayContaining([
      { index: 'R', workingTree: ' ', path: 'after\nname.txt', oldPath: 'before.txt' },
      { index: '?', workingTree: '?', path: 'untracked space.txt' },
    ]),
  });
  const diff = await cli.mesa('git', 'diff', 'lantern-cove', 'README.md', '--json');
  expect(diff.json.data.rows).toContainEqual({ kind: 'change', left: 'old', right: 'new' });
  expect(diff.json.data.patch).toContain('+new');
  expect((await cli.mesa('git', 'diff', 'lantern-cove', '../other')).code).toBe(2);
  const staged = await cli.mesa('git', 'diff', 'lantern-cove', '--staged', '--json');
  expect(staged.json.data.staged).toBe(true);
  expect(staged.json.data.patch).toContain('rename to');
  const added = await cli.mesa('git', 'stage', 'lantern-cove', 'README.md', '--json');
  expect(added.json.data).toMatchObject({
    path: 'README.md',
    action: 'stage',
    receipt: { id: expect.any(String) },
  });
  expect(
    (await cli.mesa('git', 'status', 'lantern-cove', '--json')).json.data.changes,
  ).toContainEqual(expect.objectContaining({ path: 'README.md', index: 'M', workingTree: ' ' }));
  expect((await cli.mesa('git', 'unstage', 'lantern-cove', 'README.md', '--json')).code).toBe(0);
  expect(
    (await cli.mesa('git', 'status', 'lantern-cove', '--json')).json.data.changes,
  ).toContainEqual(expect.objectContaining({ path: 'README.md', index: ' ', workingTree: 'M' }));
  await cli.mesa('git', 'stage', 'lantern-cove', 'README.md');
  const committed = await cli.mesa(
    'git',
    'commit',
    'lantern-cove',
    '--message',
    'Update README',
    '--json',
  );
  expect(committed.json.data).toMatchObject({
    oid: expect.any(String),
    summary: 'Update README',
    receipt: { id: expect.any(String) },
  });
  expect((await cli.mesa('git', 'status', 'lantern-cove', '--json')).json.data.changes).toEqual([
    expect.objectContaining({ path: 'untracked space.txt', index: '?', workingTree: '?' }),
  ]);
  const worktree = await cli.mesa('git', 'status', 'lantern-cove', '--checkout', linked, '--json');
  expect(worktree.json.data).toMatchObject({
    checkout: { path: linked, registered: false },
    changes: [],
  });
  expect((await cli.mesa('git', 'status', 'lantern-cove', '--checkout', cli.home)).code).toBe(2);
  await cli.mesa('--profile', 'other', 'init', '--vault', 'vault-other');
  expect((await cli.mesa('--profile', 'other', 'git', 'status', 'lantern-cove')).code).toBe(3);
});

test('unstage in an unborn repository keeps the working file', async () => {
  const repo = await cli.withProject();
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(join(repo, 'first.txt'), 'preserved\n');
  cli.run = withRealGit(cli.run);
  expect((await cli.mesa('git', 'stage', 'lantern-cove', 'first.txt')).code).toBe(0);
  expect((await cli.mesa('git', 'unstage', 'lantern-cove', 'first.txt')).code).toBe(0);
  expect(
    (await cli.mesa('git', 'status', 'lantern-cove', '--json')).json.data.changes,
  ).toContainEqual(expect.objectContaining({ path: 'first.txt', index: '?', workingTree: '?' }));
  expect((await cli.mesa('git', 'commit', 'lantern-cove', '--message', ' ')).code).toBe(2);
});
