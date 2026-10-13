import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, newSession, shortIds, testGit, testStore, withRealGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('diff shows a session worktree’s commits, edits and new files since its base, not the base’s later work', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'tide.txt'), 'low\n');
  gitRepo(repo);
  const linked = join(cli.home, 'reef');
  testGit(repo, 'worktree', 'add', '-q', '-b', 'session/reef', linked);
  writeFileSync(join(linked, 'chart.txt'), 'buoy\n');
  testGit(linked, 'add', '.');
  testGit(linked, 'commit', '-qm', 'chart');
  writeFileSync(join(linked, 'tide.txt'), 'high\n');
  writeFileSync(join(linked, 'notes.txt'), 'gull\nkelp\n');
  writeFileSync(join(repo, 'later.txt'), 'main only\n');
  testGit(repo, 'add', '.');
  testGit(repo, 'commit', '-qm', 'later on main');
  cli.run = withRealGit(cli.run);
  testStore(cli.home, 'default', shortIds('aaaaaaaa')).create(() =>
    newSession({ worktree: { path: linked, branch: 'session/reef', base: 'main' } }),
  );

  const result = await cli.mesa('diff', 'aaaaaaaa', '--json');
  expect(result.code, result.stdout).toBe(0);
  expect(result.json.data).toMatchObject({ base: 'main', ahead: 1 });
  const { patch, rows } = result.json.data;
  expect(patch).toContain('b/chart.txt');
  expect(patch).not.toContain('later.txt');
  expect(rows).toEqual(
    expect.arrayContaining([
      { kind: 'change', left: 'low', right: 'high', oldLine: 1, newLine: 1 },
      {
        kind: 'meta',
        left: 'diff --git a/notes.txt b/notes.txt',
        right: 'diff --git a/notes.txt b/notes.txt',
      },
      { kind: 'change', left: '', right: 'kelp', newLine: 2 },
    ]),
  );
});

test('diff refuses a General session, which has no project checkout', async () => {
  await cli.withProject();
  testStore(cli.home, 'default', shortIds('bbbbbbbb')).create(() =>
    newSession({ project: '__mesa_general__', cwd: cli.home }),
  );
  const result = await cli.mesa('diff', 'bbbbbbbb');
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('General session');
});

test('diff names a base branch the checkout lacks instead of printing Git’s error', async () => {
  gitRepo(await cli.withProject());
  cli.run = withRealGit(cli.run);
  testStore(cli.home, 'default', shortIds('cccccccc')).create(() =>
    newSession({
      worktree: { path: join(cli.home, 'src/lantern-cove'), branch: 'main', base: 'trunk' },
    }),
  );
  const result = await cli.mesa('diff', 'cccccccc');
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('base branch trunk is not in this checkout');
});
