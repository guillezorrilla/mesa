import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, newSession, shortIds, testGit, testStore, withRealGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test("diff shows the commits, edits and new files since its base, never the base's later work", async () => {
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
  const { rows } = result.json.data;
  expect(result.json.data.patch).toBeUndefined();
  const text = (await cli.mesa('diff', 'aaaaaaaa')).stdout;
  expect(text).toContain('1 commit since main');
  expect(text).toContain('b/chart.txt');
  expect(text).not.toContain('later.txt');
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

test('diff names a base branch the checkout lacks instead of printing the Git error', async () => {
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

test("once its agent moves the checkout to another branch, diff uses the project's default; --base picks any", async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'tide.txt'), 'low\n');
  gitRepo(repo);
  testGit(repo, 'branch', 'develop');
  testGit(repo, 'switch', '-q', 'develop');
  writeFileSync(join(repo, 'harbor.txt'), 'develop only\n');
  testGit(repo, 'add', '.');
  testGit(repo, 'commit', '-qm', 'develop work');
  testGit(repo, 'switch', '-q', 'main');
  const linked = join(cli.home, 'reef');
  // Made from main, then its agent started its own branch from develop.
  testGit(repo, 'worktree', 'add', '-q', '-b', 'session/reef', linked, 'main');
  testGit(linked, 'switch', '-q', '-c', 'feat/buoy', 'develop');
  writeFileSync(join(linked, 'buoy.txt'), 'red\n');
  testGit(linked, 'add', '.');
  testGit(linked, 'commit', '-qm', 'buoy');
  cli.run = withRealGit(cli.run);
  await cli.mesa('config', 'set', 'worktrees.base', 'develop');
  testStore(cli.home, 'default', shortIds('dddddddd')).create(() =>
    newSession({ worktree: { path: linked, branch: 'session/reef', base: 'main' } }),
  );

  const moved = await cli.mesa('diff', 'dddddddd', '--json');
  expect(moved.code, moved.stdout).toBe(0);
  // The recorded main would count develop's commit as the session's too.
  expect(moved.json.data).toMatchObject({ base: 'develop', ahead: 1 });
  const picked = await cli.mesa('diff', 'dddddddd', '--base', 'main', '--json');
  expect(picked.json.data).toMatchObject({ base: 'main', ahead: 2 });
  // Detached, it is on no branch it was made with either.
  testGit(linked, 'switch', '-q', '--detach');
  const detached = await cli.mesa('diff', 'dddddddd', '--json');
  expect(detached.json.data).toMatchObject({ base: 'develop', ahead: 1 });
});
