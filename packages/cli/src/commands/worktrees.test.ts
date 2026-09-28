import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolateGit, newSession, shortIds, testStore, withRealGit } from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

async function creationRepo() {
  const repo = join(cli.home, 'lantern-cove');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  await cli.mesa('register', '--create', repo);
  mkdirSync(join(repo, 'src'));
  mkdirSync(join(repo, 'docs'));
  mkdirSync(join(repo, 'cache'));
  writeFileSync(join(repo, '.gitignore'), 'cache/\n');
  writeFileSync(join(repo, 'src', 'app.ts'), 'export const app = true;\n');
  writeFileSync(join(repo, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(join(repo, 'cache', 'local.txt'), 'local invented cache\n');
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
  cli.run = withRealGit(cli.run);
  return repo;
}

const settings = (value: Record<string, unknown>) =>
  cli.mesa('config', 'set', 'worktrees', JSON.stringify(value));

test('worktree inventory filters Git state and actual profile session holders', async () => {
  const repo = join(cli.home, 'lantern-cove');
  const linked = join(cli.home, 'feature');
  const aliased = join(cli.home, 'feature-alias');
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
  symlinkSync(linked, aliased);
  cli.run = withRealGit(cli.run);
  const store = testStore(cli.home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  store.create(() => newSession());
  store.create(() =>
    newSession({ worktree: { path: aliased, branch: 'feature' }, name: 'Review' }),
  );

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

test('manual creation keeps profile default and applies sibling, nested, sparse, and explicit ignored carryover', async () => {
  const repo = await creationRepo();
  const made = await cli.mesa('worktrees', 'create', 'lantern-cove', 'default', '--json');
  expect(made.code, made.stdout).toBe(0);
  expect(made.json.data.path).toBe(join(cli.paths.worktrees, 'lantern-cove', 'default'));
  expect(made.json.data.receipt.id).toBeTypeOf('string');
  await cli.mesa('--profile', 'other', 'init', '--vault', 'other-vault');
  await cli.mesa('--profile', 'other', 'vault', 'init');
  await cli.mesa('--profile', 'other', 'register', repo);
  const other = await cli.mesa(
    '--profile',
    'other',
    'worktrees',
    'create',
    'lantern-cove',
    'other',
    '--json',
  );
  expect(other.code, other.stdout).toBe(0);
  expect(other.json.data.path).toBe(
    join(cli.home, '.mesa', 'other', 'worktrees', 'lantern-cove', 'other'),
  );

  expect(
    (
      await settings({
        location: 'sibling',
        fetch: false,
        sparseDirectories: ['src'],
        carryIgnoredDirectories: ['cache'],
      })
    ).code,
  ).toBe(0);
  const sibling = await cli.mesa('worktrees', 'create', 'lantern-cove', 'sibling', '--json');
  expect(sibling.code, sibling.stdout).toBe(0);
  const siblingPath = join(cli.home, '.mesa-worktrees', 'default', 'lantern-cove', 'sibling');
  expect(sibling.json.data.path).toBe(siblingPath);
  expect(existsSync(join(siblingPath, 'src', 'app.ts'))).toBe(true);
  expect(existsSync(join(siblingPath, 'docs', 'guide.md'))).toBe(false);
  expect(readFileSync(join(siblingPath, 'cache', 'local.txt'), 'utf8')).toBe(
    'local invented cache\n',
  );
  expect(
    execFileSync('git', ['-C', siblingPath, 'status', '--porcelain'], { encoding: 'utf8' }),
  ).toBe('');

  expect(
    (
      await settings({
        location: 'nested',
        fetch: false,
        sparseDirectories: [],
        carryIgnoredDirectories: [],
      })
    ).code,
  ).toBe(0);
  const nested = await cli.mesa('worktrees', 'create', 'lantern-cove', 'nested', '--json');
  expect(nested.code, nested.stdout).toBe(0);
  expect(nested.json.data.path).toBe(join(repo, '.mesa-worktrees', 'default', 'nested'));
  expect(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' })).toBe('');
  expect(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8')).toContain('/.mesa-worktrees');
});

test('custom location and fetched base are shared settings; failed carryover preserves source', async () => {
  const repo = await creationRepo();
  const origin = join(cli.home, 'origin.git');
  const peer = join(cli.home, 'peer');
  execFileSync('git', ['init', '-q', '--bare', origin]);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', origin]);
  execFileSync('git', ['-C', repo, 'push', '-q', '-u', 'origin', 'main']);
  execFileSync('git', ['-C', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  execFileSync('git', ['clone', '-q', origin, peer]);
  writeFileSync(join(peer, 'remote.txt'), 'new remote content\n');
  execFileSync('git', ['-C', peer, 'add', 'remote.txt']);
  execFileSync('git', [
    '-C',
    peer,
    '-c',
    'user.name=Peer',
    '-c',
    'user.email=peer@example.com',
    'commit',
    '-qm',
    'remote',
  ]);
  execFileSync('git', ['-C', peer, 'push', '-q', 'origin', 'main']);

  const customRoot = join(cli.home, 'custom');
  expect(
    (
      await settings({
        location: 'custom',
        customRoot,
        base: 'origin/main',
        fetch: true,
        sparseDirectories: [],
        carryIgnoredDirectories: [],
      })
    ).code,
  ).toBe(0);
  const created = await cli.mesa('worktrees', 'create', 'lantern-cove', 'fetched', '--json');
  expect(created.code, created.stdout).toBe(0);
  expect(created.json.data.path).toBe(join(customRoot, 'default', 'lantern-cove', 'fetched'));
  expect(created.json.data.base).toBe('origin/main');
  expect(readFileSync(join(created.json.data.path, 'remote.txt'), 'utf8')).toBe(
    'new remote content\n',
  );

  expect(
    (
      await settings({
        location: 'custom',
        customRoot: join(repo, 'inside'),
        fetch: false,
        sparseDirectories: [],
        carryIgnoredDirectories: [],
      })
    ).code,
  ).toBe(0);
  expect((await cli.mesa('worktrees', 'create', 'lantern-cove', 'inside')).code).toBe(2);
  expect(existsSync(join(repo, 'inside'))).toBe(false);

  expect(
    (
      await settings({
        location: 'profile',
        fetch: false,
        sparseDirectories: [],
        carryIgnoredDirectories: ['src'],
      })
    ).code,
  ).toBe(0);
  const refused = await cli.mesa('worktrees', 'create', 'lantern-cove', 'refused');
  expect(refused.code).toBe(2);
  expect(existsSync(join(repo, 'src', 'app.ts'))).toBe(true);
  expect(existsSync(join(cli.paths.worktrees, 'lantern-cove', 'refused'))).toBe(false);
  expect(
    execFileSync('git', ['-C', repo, 'branch', '--list', 'refused'], { encoding: 'utf8' }),
  ).toBe('');
});
