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
  expect(made.json.data.receipt).toBeNull();
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

test('configured setup runs in the checkout, reruns there, and leaves a failed checkout intact', async () => {
  const repo = await creationRepo();
  const prior = cli.run;
  const calls: string[] = [];
  cli.run = (file, args, ms, options) => {
    if (file === '/usr/bin/touch') {
      calls.push(options?.cwd ?? '');
      writeFileSync(join(options?.cwd ?? '', args[0] ?? ''), 'setup ran');
      return Promise.resolve({ ok: true, stdout: '' });
    }
    if (file === '/usr/bin/false')
      return Promise.resolve({ ok: false, reason: 'failed', detail: 'setup failed' });
    return prior(file, args, ms, options);
  };
  expect(
    (await cli.mesa('config', 'set', 'worktrees.setup', '["/usr/bin/touch", "ready"]')).code,
  ).toBe(0);
  const created = await cli.mesa('worktrees', 'create', 'lantern-cove', 'setup', '--json');
  expect(created.code, created.stdout).toBe(0);
  const path = created.json.data.path as string;
  expect(calls).toEqual([path]);
  expect(readFileSync(join(path, 'ready'), 'utf8')).toBe('setup ran');
  rmSync(join(path, 'ready'));
  const rerun = await cli.mesa('worktrees', 'rerun', 'lantern-cove', path, '--json');
  expect(rerun.code, rerun.stdout).toBe(0);
  expect(rerun.json.data).toMatchObject({ path, ran: true });
  expect(calls).toEqual([path, path]);
  expect(existsSync(join(path, 'ready'))).toBe(true);
  expect((await cli.mesa('worktrees', 'rerun', 'lantern-cove', repo)).code).toBe(2);

  await cli.mesa('config', 'set', 'worktrees.setup', '["/usr/bin/false"]');
  const failed = await cli.mesa('worktrees', 'create', 'lantern-cove', 'failed', '--json');
  expect(failed.code).toBe(2);
  expect(failed.json.error.message).toContain('checkout remains');
  expect(existsSync(join(cli.paths.worktrees, 'lantern-cove', 'failed'))).toBe(true);
  expect((await cli.mesa('worktrees', 'list', 'lantern-cove', '--json')).json.data).toEqual(
    expect.arrayContaining([expect.objectContaining({ branch: 'failed', state: 'ready' })]),
  );
});

test('remove rechecks changed files, current sessions, teardown output, and the preview token', async () => {
  const repo = await creationRepo();
  const remote = join(cli.home, 'published.git');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', remote]);
  execFileSync('git', ['-C', repo, 'push', '-q', 'origin', 'main']);
  const created = await cli.mesa('worktrees', 'create', 'lantern-cove', 'remove-me', '--json');
  const path = created.json.data.path as string;
  const preview = async () =>
    (await cli.mesa('worktrees', 'preview', 'lantern-cove', path, '--action', 'remove', '--json'))
      .json.data;
  const apply = (token: string) =>
    cli.mesa(
      'worktrees',
      'apply',
      'lantern-cove',
      path,
      '--action',
      'remove',
      '--token',
      token,
      '--json',
    );
  const clean = await preview();
  expect(clean).toMatchObject({ allowed: true, paths: [path], branch: 'remove-me' });
  expect((await apply('wrong-token')).code).toBe(2);
  writeFileSync(join(path, 'draft.txt'), 'keep this');
  expect((await apply(clean.token)).code).toBe(2);
  expect((await preview()).reasons).toContain('worktree has changed or untracked files');
  expect(existsSync(join(path, 'draft.txt'))).toBe(true);
  rmSync(join(path, 'draft.txt'));
  mkdirSync(join(path, 'cache'));
  writeFileSync(join(path, 'cache', 'local.txt'), 'ignored data');
  expect((await preview()).reasons).toContain('worktree has ignored files');
  rmSync(join(path, 'cache'), { recursive: true });

  const store = testStore(cli.home, 'default', shortIds('cccccccc'));
  const beforeHolder = await preview();
  store.create(() => newSession({ worktree: { path, branch: 'remove-me' } }));
  expect((await apply(beforeHolder.token)).code).toBe(2);
  expect((await preview()).reasons).toContain('a session still references this worktree');
  store.remove('cccccccc');

  const original = cli.run;
  cli.run = (file, args, ms, options) => {
    if (file === '/usr/bin/touch') {
      writeFileSync(join(options?.cwd ?? '', args[0] ?? ''), 'teardown output');
      return Promise.resolve({ ok: true, stdout: '' });
    }
    if (file === '/usr/bin/true') return Promise.resolve({ ok: true, stdout: '' });
    return original(file, args, ms, options);
  };
  await cli.mesa('config', 'set', 'worktrees.teardown', '["/usr/bin/touch", "left.txt"]');
  const withTeardown = await preview();
  expect((await apply(withTeardown.token)).json.error.message).toContain('teardown ran');
  expect(existsSync(join(path, 'left.txt'))).toBe(true);
  rmSync(join(path, 'left.txt'));
  await cli.mesa('config', 'set', 'worktrees.teardown', '["/usr/bin/true"]');
  const final = await preview();
  const removed = await apply(final.token);
  expect(removed.code, removed.stdout).toBe(0);
  expect(removed.json.data).toMatchObject({ action: 'remove', paths: [path], teardownRan: true });
  expect(existsSync(path)).toBe(false);
  expect(
    execFileSync('git', ['-C', repo, 'branch', '--list', 'remove-me'], { encoding: 'utf8' }),
  ).toContain('remove-me');
});

test('recycle preserves dirty and unpublished work, and cleanup prunes only missing registrations', async () => {
  const repo = await creationRepo();
  const dirty = (await cli.mesa('worktrees', 'create', 'lantern-cove', 'dirty', '--json')).json.data
    .path as string;
  writeFileSync(join(dirty, 'draft.txt'), 'untracked');
  writeFileSync(join(dirty, 'src', 'app.ts'), 'new commit\n');
  execFileSync('git', ['-C', dirty, 'add', 'src/app.ts']);
  execFileSync('git', [
    '-C',
    dirty,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'new work',
  ]);
  const remove = await cli.mesa(
    'worktrees',
    'preview',
    'lantern-cove',
    dirty,
    '--action',
    'remove',
    '--json',
  );
  expect(remove.json.data.allowed).toBe(false);
  expect(remove.json.data.unpublished).toBe(true);
  const recycle = await cli.mesa(
    'worktrees',
    'preview',
    'lantern-cove',
    dirty,
    '--action',
    'recycle',
    '--json',
  );
  expect(recycle.json.data.allowed).toBe(true);
  const moved = await cli.mesa(
    'worktrees',
    'apply',
    'lantern-cove',
    dirty,
    '--action',
    'recycle',
    '--token',
    recycle.json.data.token,
    '--json',
  );
  expect(moved.code, moved.stdout).toBe(0);
  const destination = moved.json.data.destination as string;
  expect(readFileSync(join(destination, 'draft.txt'), 'utf8')).toBe('untracked');
  expect(existsSync(dirty)).toBe(false);
  expect(
    (await cli.mesa('worktrees', 'list', 'lantern-cove', '--state', 'recycled', '--json')).json
      .data,
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: destination, branch: 'dirty' })]),
  );

  const stale = (await cli.mesa('worktrees', 'create', 'lantern-cove', 'stale', '--json')).json.data
    .path as string;
  rmSync(stale, { recursive: true });
  const first = await cli.mesa(
    'worktrees',
    'preview',
    'lantern-cove',
    '--action',
    'cleanup',
    '--json',
  );
  expect(first.json.data).toMatchObject({ allowed: true, paths: [stale] });
  const store = testStore(cli.home, 'default', shortIds('dddddddd'));
  store.create(() => newSession({ worktree: { path: stale, branch: 'stale' } }));
  expect(
    (
      await cli.mesa(
        'worktrees',
        'apply',
        'lantern-cove',
        '--action',
        'cleanup',
        '--token',
        first.json.data.token,
      )
    ).code,
  ).toBe(2);
  store.remove('dddddddd');
  const fresh = await cli.mesa(
    'worktrees',
    'preview',
    'lantern-cove',
    '--action',
    'cleanup',
    '--json',
  );
  const cleaned = await cli.mesa(
    'worktrees',
    'apply',
    'lantern-cove',
    '--action',
    'cleanup',
    '--token',
    fresh.json.data.token,
    '--json',
  );
  expect(cleaned.code, cleaned.stdout).toBe(0);
  expect(cleaned.json.data).toMatchObject({ paths: [stale], remaining: [] });
  expect(
    execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }),
  ).not.toContain(stale);
  expect(existsSync(join(destination, 'draft.txt'))).toBe(true);
});

test('a branch moved after preview cannot be removed with the old token', async () => {
  await creationRepo();
  const path = (await cli.mesa('worktrees', 'create', 'lantern-cove', 'moving', '--json')).json.data
    .path as string;
  const before = (
    await cli.mesa('worktrees', 'preview', 'lantern-cove', path, '--action', 'remove', '--json')
  ).json.data;
  execFileSync('git', [
    '-C',
    path,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-qm',
    'local work',
  ]);
  const refused = await cli.mesa(
    'worktrees',
    'apply',
    'lantern-cove',
    path,
    '--action',
    'remove',
    '--token',
    before.token,
    '--json',
  );
  expect(refused.code).toBe(2);
  expect(refused.json.error.message).toContain('changed since preview');
  const after = (
    await cli.mesa('worktrees', 'preview', 'lantern-cove', path, '--action', 'remove', '--json')
  ).json.data;
  expect(after.unpublished).toBe(true);
  expect(existsSync(path)).toBe(true);
});

test('a local branch does not make unpushed work appear published', async () => {
  const repo = await creationRepo();
  const path = (await cli.mesa('worktrees', 'create', 'lantern-cove', 'local-only', '--json')).json
    .data.path as string;
  execFileSync('git', [
    '-C',
    path,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-qm',
    'unpublished work',
  ]);
  const head = execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repo, 'update-ref', 'refs/heads/main', head]);
  const preview = await cli.mesa(
    'worktrees',
    'preview',
    'lantern-cove',
    path,
    '--action',
    'remove',
    '--json',
  );
  expect(preview.json.data.unpublished).toBe(true);
  expect(preview.json.data.allowed).toBe(false);
  expect(existsSync(path)).toBe(true);
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
