import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolateGit, newSession, shortIds, testStore, withRealGit } from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

test('worktree inventory filters Git state and actual profile session holders', async () => {
  const repo = join(cli.home, 'lantern-cove');
  const linked = join(cli.home, 'feature');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  await cli.mesa('register', '--create', repo);
  writeFileSync(join(repo, 'README.md'), 'invented\n');
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
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', linked]);
  cli.run = withRealGit(cli.run);
  const store = testStore(cli.home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  store.create(() => newSession());
  store.create(() => newSession({ worktree: { path: linked, branch: 'feature' }, name: 'Review' }));

  const listed = await cli.mesa('worktrees', 'list', 'lantern-cove', '--json');
  expect(listed.code, listed.stdout).toBe(0);
  expect(listed.json.data).toMatchObject([
    { path: repo, main: true, state: 'ready', holders: [{ id: 'aaaaaaaa' }] },
    {
      path: linked,
      branch: 'feature',
      main: false,
      state: 'ready',
      holders: [{ id: 'bbbbbbbb', name: 'Review' }],
    },
  ]);
  const filtered = await cli.mesa(
    'worktrees',
    'list',
    'lantern-cove',
    '--branch',
    'feat',
    '--holder',
    'bbbbbbbb',
    '--json',
  );
  expect(filtered.json.data).toHaveLength(1);
  expect(filtered.json.data[0].path).toBe(linked);
  expect((await cli.mesa('worktrees', 'list', 'lantern-cove', '--state', 'unknown')).code).toBe(2);

  execFileSync('git', ['-C', repo, 'worktree', 'lock', linked]);
  expect(
    (await cli.mesa('worktrees', 'list', 'lantern-cove', '--state', 'locked', '--json')).json
      .data[0].path,
  ).toBe(linked);
  execFileSync('git', ['-C', repo, 'worktree', 'unlock', linked]);
  rmSync(linked, { recursive: true });
  expect(
    (await cli.mesa('worktrees', 'list', 'lantern-cove', '--state', 'stale', '--json')).json.data[0]
      .path,
  ).toBe(linked);
  await cli.mesa('--profile', 'other', 'init', '--vault', 'other-vault');
  expect((await cli.mesa('--profile', 'other', 'worktrees', 'list', 'lantern-cove')).code).toBe(3);
});
