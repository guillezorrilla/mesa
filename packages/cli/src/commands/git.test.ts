import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execRunner } from '@mesa/core';
import {
  gitRepo,
  isolateGit,
  newSession,
  shortIds,
  testStore,
  withRealGit,
} from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

test('insight keeps local Git facts when gh is missing and links PRs by session branch when available', async () => {
  const repo = await cli.withProject();
  gitRepo(repo);
  const linked = join(cli.home, 'feature');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', linked]);
  const store = testStore(cli.home, 'default', shortIds('aaaaaaaa'));
  store.create(() => newSession({ worktree: { path: linked, branch: 'feature' } }));
  const native = withRealGit(cli.run);
  const ghCalls: { args: string[]; cwd?: string }[] = [];
  cli.run = (file, args, ms, options) => {
    if (file !== 'gh') return native(file, args, ms, options);
    ghCalls.push({ args, cwd: options?.cwd });
    if (args[0] === '--version')
      return Promise.resolve({ ok: true, stdout: 'gh version 2.test\n' });
    return Promise.resolve({
      ok: true,
      stdout: JSON.stringify([
        {
          number: 42,
          title: 'Feature',
          url: 'https://github.com/example/repo/pull/42',
          state: 'MERGED',
          isDraft: false,
          headRefName: 'feature',
          updatedAt: '2026-09-27T00:00:00Z',
          mergedAt: '2026-09-27T00:00:00Z',
          closedAt: '2026-09-27T00:00:00Z',
        },
        {
          number: 43,
          title: 'Other',
          url: 'https://github.com/example/repo/pull/43',
          state: 'OPEN',
          isDraft: false,
          headRefName: 'other',
          updatedAt: '2026-09-27T00:00:00Z',
          mergedAt: null,
          closedAt: null,
        },
      ]),
    });
  };
  const found = await cli.mesa('git', 'insight', 'lantern-cove', '--json');
  expect(found.code, found.stdout).toBe(0);
  expect(found.json.data).toMatchObject({
    local: { source: 'git', branch: 'main', worktrees: 2, observedAt: expect.any(String) },
    pullRequests: {
      source: 'gh',
      availability: 'available',
      searched: true,
      version: 'gh version 2.test',
      matches: [{ number: 42, state: 'MERGED', sessionIds: ['aaaaaaaa'], linkedBy: 'branch-name' }],
    },
  });
  expect(ghCalls.map((call) => call.args[0])).toEqual(['--version', 'pr']);
  expect(ghCalls[1]?.cwd).toBe(repo);
  cli.run = (file, args, ms, options) =>
    file === 'gh'
      ? Promise.resolve({ ok: false, reason: 'missing', detail: 'missing' })
      : native(file, args, ms, options);
  const missing = await cli.mesa('git', 'insight', 'lantern-cove', '--json');
  expect(missing.code).toBe(0);
  expect(missing.json.data).toMatchObject({
    local: { source: 'git', worktrees: 2 },
    pullRequests: { availability: 'missing', searched: false, matches: [] },
  });
  cli.run = (file, args, ms, options) => {
    if (file !== 'gh') return native(file, args, ms, options);
    return args[0] === '--version'
      ? Promise.resolve({ ok: true, stdout: 'gh version 2.test\n' })
      : Promise.resolve({ ok: false, reason: 'failed', detail: 'not authenticated' });
  };
  const unavailable = await cli.mesa('git', 'insight', 'lantern-cove', '--json');
  expect(unavailable.code).toBe(0);
  expect(unavailable.json.data.pullRequests).toMatchObject({
    availability: 'unavailable',
    unavailableReason: 'failed',
    searched: true,
    matches: [],
  });
});

test('git status uses the registered checkout, linked worktrees, and literal NUL paths', async () => {
  const repo = join(cli.home, 'lantern-cove');
  const linked = join(cli.home, 'feature checkout');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
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
    receipt: null,
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
    receipt: null,
  });
  expect((await cli.mesa('git', 'status', 'lantern-cove', '--json')).json.data.changes).toEqual([
    expect.objectContaining({ path: 'untracked space.txt', index: '?', workingTree: '?' }),
  ]);
  // A tag of the same name must not turn the branch into heads/feature.
  execFileSync('git', ['-C', repo, 'tag', 'feature']);
  const branches = await cli.mesa('git', 'branches', 'lantern-cove', '--json');
  expect(branches.json.data.branches).toContainEqual(
    expect.objectContaining({ name: 'feature', checkedOutAt: linked, current: false }),
  );
  const created = await cli.mesa('git', 'branch', 'create', 'lantern-cove', 'docs/readme');
  expect(created.code, created.stdout).toBe(0);
  expect((await cli.mesa('git', 'branch', 'checkout', 'lantern-cove', 'docs/readme')).code).toBe(0);
  expect(
    (await cli.mesa('git', 'branches', 'lantern-cove', '--json')).json.data.branches,
  ).toContainEqual(expect.objectContaining({ name: 'docs/readme', current: true }));
  expect((await cli.mesa('git', 'branch', 'checkout', 'lantern-cove', 'main')).code).toBe(0);
  expect((await cli.mesa('git', 'branch', 'delete', 'lantern-cove', 'docs/readme')).code).toBe(0);
  expect((await cli.mesa('git', 'branch', 'delete', 'lantern-cove', 'feature')).code).toBe(2);
  expect(
    (await cli.mesa('git', 'branches', 'lantern-cove', '--json')).json.data.branches.map(
      (row: { name: string }) => row.name,
    ),
  ).toContain('feature');
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

test('an untracked path displayed by status can be staged', async () => {
  const repo = await cli.withProject();
  gitRepo(repo);
  mkdirSync(join(repo, 'new-directory'));
  writeFileSync(join(repo, 'new-directory', 'first.txt'), 'preserved\n');
  cli.run = withRealGit(cli.run);
  const status = await cli.mesa('git', 'status', 'lantern-cove', '--json');
  const path = status.json.data.changes[0].path as string;
  expect(path).toBe('new-directory/first.txt');
  expect((await cli.mesa('git', 'stage', 'lantern-cove', path)).code).toBe(0);
});

test('branch checkout refuses a live session holder', async () => {
  const repo = await cli.withProject();
  gitRepo(repo);
  cli.withTmux();
  cli.run = withRealGit(cli.run);
  expect((await cli.mesa('git', 'branch', 'create', 'lantern-cove', 'next')).code).toBe(0);
  const opened = await cli.mesa(
    'open',
    'lantern-cove',
    '--agent',
    'claude',
    '--goal',
    'wait here',
    '--json',
  );
  expect(opened.code).toBe(0);
  const switched = await cli.mesa('git', 'branch', 'checkout', 'lantern-cove', 'next', '--json');
  expect(switched.code).toBe(2);
  expect(switched.json.error.message).toContain(`session ${opened.json.data.id} still uses`);
  expect(
    (await cli.mesa('git', 'branches', 'lantern-cove', '--json')).json.data.branches,
  ).toContainEqual(expect.objectContaining({ name: 'main', current: true }));
});

test('stash actions save, apply, pop and drop without losing a conflicting stash', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'note.txt'), 'base\n');
  gitRepo(repo);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'test@example.com']);
  cli.run = withRealGit(cli.run);

  const empty = await cli.mesa('git', 'stash', 'create', 'lantern-cove', '--json');
  expect(empty.json.data).toMatchObject({ created: false, receipt: null });
  writeFileSync(join(repo, 'note.txt'), 'saved\n');
  writeFileSync(join(repo, 'untracked name.txt'), 'extra\n');
  const saved = await cli.mesa(
    'git',
    'stash',
    'create',
    'lantern-cove',
    '--message',
    'Before edit',
    '--json',
  );
  expect(saved.code, saved.stdout).toBe(0);
  expect(saved.json.data).toMatchObject({
    created: true,
    oid: expect.any(String),
    receipt: null,
  });
  const listed = await cli.mesa('git', 'stashes', 'lantern-cove', '--json');
  expect(listed.json.data.stashes).toContainEqual(
    expect.objectContaining({
      ref: 'stash@{0}',
      oid: saved.json.data.oid,
      message: expect.stringContaining('Before edit'),
    }),
  );
  expect(readFileSync(join(repo, 'note.txt'), 'utf8')).toBe('base\n');

  const applied = await cli.mesa('git', 'stash', 'apply', 'lantern-cove', 'stash@{0}', '--json');
  expect(applied.code, applied.stdout).toBe(0);
  expect(readFileSync(join(repo, 'note.txt'), 'utf8')).toBe('saved\n');
  expect(readFileSync(join(repo, 'untracked name.txt'), 'utf8')).toBe('extra\n');
  expect(
    (await cli.mesa('git', 'stashes', 'lantern-cove', '--json')).json.data.stashes,
  ).toHaveLength(1);

  execFileSync('git', ['-C', repo, 'reset', '--hard', '-q']);
  execFileSync('git', ['-C', repo, 'clean', '-fq']);
  writeFileSync(join(repo, 'note.txt'), 'conflicting local edit\n');
  const refused = await cli.mesa('git', 'stash', 'pop', 'lantern-cove', 'stash@{0}', '--json');
  expect(refused.code).toBe(2);
  expect(readFileSync(join(repo, 'note.txt'), 'utf8')).toBe('conflicting local edit\n');
  expect(
    (await cli.mesa('git', 'stashes', 'lantern-cove', '--json')).json.data.stashes,
  ).toHaveLength(1);

  execFileSync('git', ['-C', repo, 'reset', '--hard', '-q']);
  execFileSync('git', ['-C', repo, 'clean', '-fq']);
  const popped = await cli.mesa('git', 'stash', 'pop', 'lantern-cove', 'stash@{0}', '--json');
  expect(popped.code, popped.stdout).toBe(0);
  expect(readFileSync(join(repo, 'note.txt'), 'utf8')).toBe('saved\n');
  expect(
    (await cli.mesa('git', 'stashes', 'lantern-cove', '--json')).json.data.stashes,
  ).toHaveLength(0);

  const again = await cli.mesa('git', 'stash', 'create', 'lantern-cove', '--json');
  expect(again.json.data.created).toBe(true);
  // An agent stashes after the list was read: stash@{0} now names its stash, not the listed one.
  writeFileSync(join(repo, 'note.txt'), 'agent work\n');
  execFileSync('git', ['-C', repo, 'stash', 'push', '-q', '-m', 'agent']);
  const shifted = await cli.mesa(
    'git',
    'stash',
    'drop',
    'lantern-cove',
    'stash@{0}',
    `--oid=${again.json.data.oid}`,
    '--json',
  );
  expect(shifted.code).toBe(2);
  expect(shifted.json.error.message).toContain('no longer the stash you selected');
  expect(
    (await cli.mesa('git', 'stashes', 'lantern-cove', '--json')).json.data.stashes,
  ).toHaveLength(2);
  expect(
    (
      await cli.mesa(
        'git',
        'stash',
        'drop',
        'lantern-cove',
        'stash@{1}',
        `--oid=${again.json.data.oid}`,
      )
    ).code,
  ).toBe(0);
  expect((await cli.mesa('git', 'stash', 'drop', 'lantern-cove', 'stash@{0}', '--json')).code).toBe(
    0,
  );
  expect(
    (await cli.mesa('git', 'stashes', 'lantern-cove', '--json')).json.data.stashes,
  ).toHaveLength(0);
  expect((await cli.mesa('git', 'stash', 'apply', 'lantern-cove', '--bad-ref')).code).toBe(2);
});

test('explicit push and fast-forward pull use the selected upstream and preserve rejected work', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'note.txt'), 'base\n');
  gitRepo(repo);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'test@example.com']);
  cli.run = withRealGit(cli.run);
  expect((await cli.mesa('git', 'tracking', 'lantern-cove')).code).toBe(2);
  const remote = join(cli.home, 'origin.git');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', remote]);
  execFileSync('git', ['-C', repo, 'push', '-q', '-u', 'origin', 'main']);
  expect((await cli.mesa('git', 'tracking', 'lantern-cove', '--json')).json.data).toMatchObject({
    branch: 'main',
    remote: 'origin',
    upstream: 'main',
  });

  writeFileSync(join(repo, 'note.txt'), 'local\n');
  execFileSync('git', ['-C', repo, 'add', 'note.txt']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'local']);
  writeFileSync(join(repo, 'mesa.yaml'), 'name: lantern-cove\nguardrail: strict\n');
  const blocked = await cli.mesa('git', 'push', 'lantern-cove', '--json');
  expect(blocked.code).toBe(5);
  expect(blocked.json.error.details.verdict).toBe('ask');
  expect(
    execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], {
      encoding: 'utf8',
    }).trim(),
  ).not.toBe(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  const pushed = await cli.mesa('git', 'push', 'lantern-cove', '--yes', '--json');
  expect(pushed.code, pushed.stdout).toBe(0);
  expect(pushed.json.data).toMatchObject({
    action: 'push',
    remote: 'origin',
    upstream: 'main',
    override: 'yes',
    receipt: { id: expect.any(String) },
  });
  execFileSync('git', ['-C', repo, 'restore', '--', 'mesa.yaml']);

  const peer = join(cli.home, 'peer');
  execFileSync('git', ['clone', '-q', remote, peer]);
  writeFileSync(join(peer, 'peer.txt'), 'peer change\n');
  execFileSync('git', ['-C', peer, 'add', '.']);
  execFileSync('git', [
    '-C',
    peer,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'peer',
  ]);
  execFileSync('git', ['-C', peer, 'push', '-q', 'origin', 'main']);
  writeFileSync(join(repo, 'dirty.txt'), 'keep me\n');
  expect((await cli.mesa('git', 'pull', 'lantern-cove', '--yes')).code).toBe(2);
  expect(readFileSync(join(repo, 'dirty.txt'), 'utf8')).toBe('keep me\n');
  execFileSync('git', ['-C', repo, 'clean', '-fq']);
  const pulled = await cli.mesa('git', 'pull', 'lantern-cove', '--yes', '--json');
  expect(pulled.code, pulled.stdout).toBe(0);
  expect(pulled.json.data.before).not.toBe(pulled.json.data.after);
  expect(readFileSync(join(repo, 'peer.txt'), 'utf8')).toBe('peer change\n');

  writeFileSync(join(repo, 'local.txt'), 'local again\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'local again']);
  writeFileSync(join(peer, 'peer2.txt'), 'remote again\n');
  execFileSync('git', ['-C', peer, 'add', '.']);
  execFileSync('git', [
    '-C',
    peer,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'peer again',
  ]);
  execFileSync('git', ['-C', peer, 'push', '-q', 'origin', 'main']);
  const localHead = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  expect((await cli.mesa('git', 'push', 'lantern-cove', '--yes')).code).toBe(2);
  expect(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).toBe(
    localHead,
  );
  expect((await cli.mesa('git', 'pull', 'lantern-cove', '--yes')).code).toBe(2);
  expect(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).toBe(
    localHead,
  );
});

test('commit graph filters local branches and compares divergent refs', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'base.txt'), 'base\n');
  gitRepo(repo);
  cli.run = withRealGit(cli.run);
  execFileSync('git', ['-C', repo, 'switch', '-q', '-c', 'feature']);
  writeFileSync(join(repo, 'feature.txt'), 'feature\n');
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
    'feature work',
  ]);
  execFileSync('git', ['-C', repo, 'switch', '-q', 'main']);
  writeFileSync(join(repo, 'main.txt'), 'main\n');
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
    'main work',
  ]);

  const all = await cli.mesa('git', 'graph', 'lantern-cove', '--json');
  expect(all.code, all.stdout).toBe(0);
  expect(all.json.data.commits).toBe(3);
  expect(all.json.data.rows).toContainEqual(
    expect.objectContaining({
      commit: expect.objectContaining({ subject: 'feature work', parents: [expect.any(String)] }),
    }),
  );
  expect(all.json.data.rows.some((row: { graph: string }) => row.graph.includes('*'))).toBe(true);
  const filtered = await cli.mesa('git', 'graph', 'lantern-cove', '--branch', 'feature', '--json');
  expect(filtered.json.data.commits).toBe(2);
  expect(
    filtered.json.data.rows.some(
      (row: { commit?: { subject: string } }) => row.commit?.subject === 'main work',
    ),
  ).toBe(false);
  expect((await cli.mesa('git', 'graph', 'lantern-cove', '--branch', 'gone')).code).toBe(3);

  const compared = await cli.mesa('git', 'compare', 'lantern-cove', 'main', 'feature', '--json');
  expect(compared.code, compared.stdout).toBe(0);
  expect(compared.json.data).toMatchObject({
    behind: 1,
    ahead: 1,
    rows: expect.arrayContaining([{ kind: 'change', left: '', right: 'feature' }]),
  });
  expect(compared.json.data.patch).toContain('feature.txt');
  expect((await cli.mesa('git', 'compare', '--', 'lantern-cove', '--help', 'feature')).code).toBe(
    2,
  );
});
