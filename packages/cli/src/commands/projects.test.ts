import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withRealGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;
const sha256 = (argv: string[]) => createHash('sha256').update(JSON.stringify(argv)).digest('hex');

test('register, projects, unregister', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(cli.home, 'lantern-cove'));
  expect((await mesa('register', 'lantern-cove')).code).toBe(3);
  expect((await mesa('register', 'lantern-cove', '--create')).stdout.split('\n')[0]).toBe(
    `registered lantern-cove at ${cli.home}/lantern-cove (wrote mesa.yaml)`,
  );
  expect((await mesa('register', 'lantern-cove')).code).toBe(4);
  const { json } = await mesa('projects', '--json');
  expect(json.data).toEqual([
    {
      name: 'lantern-cove',
      label: 'lantern-cove',
      path: `${cli.home}/lantern-cove`,
      agent: 'claude',
      priority: 0.5,
      skills: [],
      overrides: {},
      terminalTheme: 'follow',
      unapproved: {},
      exists: true,
      pinned: false,
      hidden: false,
    },
  ]);
  expect((await mesa('projects')).stdout).toBe(
    `lantern-cove  ${cli.home}/lantern-cove  claude  0.5\n`,
  );
  const gone = (await mesa('unregister', 'lantern-cove', '--json')).json.data;
  expect(gone).toMatchObject({ name: 'lantern-cove', receipt: null });
  expect((await mesa('receipts', '--json')).json.data).toEqual([]);
  expect((await mesa('projects')).stdout).toBe(
    'no projects registered; run mesa register <path>\n',
  );
});

test('register --label saves the optional display name and refuses invalid names before writing', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'lantern-cove'));
  const result = await mesa(
    'register',
    'lantern-cove',
    '--create',
    '--label',
    'Lantern Cove',
    '--json',
  );
  expect(result.json.data).toMatchObject({ name: 'lantern-cove', label: 'Lantern Cove' });
  expect((await mesa('projects', '--json')).json.data[0]).toMatchObject({
    name: 'lantern-cove',
    label: 'Lantern Cove',
  });
  mkdirSync(join(cli.home, 'invalid'));
  expect((await mesa('register', 'invalid', '--create', '--label', 'bad\nname')).code).toBe(2);
  expect(existsSync(join(cli.home, 'invalid', 'mesa.yaml'))).toBe(false);
});

test('projects update changes profile presentation without renaming its slug', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'lantern-cove'));
  await mesa('register', 'lantern-cove', '--create');
  const changed = await mesa(
    'projects',
    'update',
    'lantern-cove',
    '--label',
    'Lantern Cove',
    '--pinned',
    'true',
    '--json',
  );
  expect(changed.json.data).toMatchObject({
    name: 'lantern-cove',
    label: 'Lantern Cove',
    pinned: true,
  });
  expect((await mesa('projects', '--json')).json.data[0]).toMatchObject({
    name: 'lantern-cove',
    label: 'Lantern Cove',
    pinned: true,
  });
  expect((await mesa('projects', 'update', 'lantern-cove', '--hidden', 'maybe')).code).toBe(2);
});

test('projects discover --json reports registered candidates under a chosen root', async () => {
  await mesa('init', '--vault', 'vault');
  const path = join(cli.home, 'src', 'lantern-cove');
  mkdirSync(path, { recursive: true });
  await mesa('register', path, '--create');
  const found = await mesa('projects', 'discover', join(cli.home, 'src'), '--json');
  expect(found.json.data).toEqual([
    { path, name: 'lantern-cove', configured: true, registered: true },
  ]);
});

test('projects clone --json validates and registers a checkout through the injected runner', async () => {
  await mesa('init', '--vault', 'vault');
  const native = cli.run;
  cli.run = async (file, args, timeout) => {
    if (file !== 'git') return native(file, args, timeout);
    writeFileSync(join(args[3] ?? '', 'README.md'), 'Invented content');
    return { ok: true, stdout: '' };
  };
  const url = 'mesa://clone?url=https%3A%2F%2Fexample.com%2Fteam%2Fnew-repo.git';
  const cloned = await mesa('projects', 'clone', url, '--json');
  expect(cloned.json.data).toMatchObject({
    name: 'new-repo',
    path: join(cli.paths.checkouts, 'new-repo'),
    url: 'https://example.com/team/new-repo.git',
  });
  expect((await mesa('projects', '--json')).json.data[0].name).toBe('new-repo');
  expect((await mesa('projects', 'clone', 'file:///tmp/repo', '--json')).code).toBe(2);
});

test('projects sorting and visits use the profile registry without vault receipts', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  for (const name of ['lantern', 'tide']) {
    mkdirSync(join(cli.home, name));
    await mesa('register', name, '--create');
  }
  const before = (await mesa('receipts', '--json')).json.data;
  const visit = await mesa('projects', 'visit', 'tide', '--json');
  expect(visit.json.data).toMatchObject({ name: 'tide', visits: 1 });
  for (const sort of ['recent', 'most-visited']) {
    const result = await mesa('projects', '--sort', sort, '--json');
    expect(result.code).toBe(0);
    expect(result.json.data.map((project: { name: string }) => project.name)).toEqual([
      'tide',
      'lantern',
    ]);
  }
  const plain = async () =>
    (await mesa('projects', '--json')).json.data.map((project: { name: string }) => project.name);
  expect(await plain()).toEqual(['lantern', 'tide']);
  await mesa('config', 'set', 'projects.sort', 'recent');
  expect(await plain()).toEqual(['tide', 'lantern']);
  expect((await mesa('projects', '--sort', 'bad', '--json')).code).toBe(2);
  expect((await mesa('projects', 'visit', 'absent', '--json')).code).toBe(3);
  expect((await mesa('receipts', '--json')).json.data).toEqual(before);
});

test('projects set writes one mesa.yaml override and --unset removes it, keeping the other fields', async () => {
  await mesa('init', '--vault', 'vault');
  const dir = join(cli.home, 'lantern-cove');
  mkdirSync(dir);
  const original = '# Lantern Cove\nname: lantern-cove\npriority: 0.8 # high\nguardrail: strict\n';
  writeFileSync(join(dir, 'mesa.yaml'), original);
  await mesa('register', 'lantern-cove');
  const file = () => readFileSync(join(dir, 'mesa.yaml'), 'utf8');

  const set = await mesa('projects', 'set', 'lantern-cove', 'worktrees.base', 'develop', '--json');
  expect(set.json.data).toMatchObject({
    project: 'lantern-cove',
    path: 'worktrees.base',
    value: 'develop',
  });
  expect(
    (await mesa('projects', 'set', 'lantern-cove', 'worktrees.sparseDirectories', '[apps/web]'))
      .stdout,
  ).toBe('worktrees.sparseDirectories = ["apps/web"] in lantern-cove\n');
  await mesa('projects', 'set', 'lantern-cove', 'terminal.theme', 'dark');
  expect(file()).toBe(
    `${original}worktrees:\n  base: develop\n  sparseDirectories:\n    - apps/web\nterminal:\n  theme: dark\n`,
  );
  expect((await mesa('projects', '--json')).json.data[0]).toMatchObject({
    overrides: {
      worktrees: { base: 'develop', sparseDirectories: ['apps/web'] },
      terminal: { theme: 'dark' },
    },
    terminalTheme: 'dark',
  });

  const unset = await mesa(
    'projects',
    'set',
    'lantern-cove',
    'terminal.theme',
    '--unset',
    '--json',
  );
  expect(unset.json.data).toMatchObject({ path: 'terminal.theme', value: null });
  await mesa('projects', 'set', 'lantern-cove', 'worktrees.base', '--unset');
  await mesa('projects', 'set', 'lantern-cove', 'worktrees.sparseDirectories', '--unset');
  expect(file()).toBe(original);

  // A value and --unset, neither, a path that is not an override, or a bad value: nothing written.
  expect(
    (await mesa('projects', 'set', 'lantern-cove', 'worktrees.fetch', 'true', '--unset')).code,
  ).toBe(2);
  expect((await mesa('projects', 'set', 'lantern-cove', 'worktrees.fetch')).code).toBe(2);
  expect((await mesa('projects', 'set', 'lantern-cove', 'priority', '0.1')).code).toBe(2);
  expect((await mesa('projects', 'set', 'lantern-cove', 'terminal.theme', 'neon')).code).toBe(4);
  expect((await mesa('projects', 'set', 'unknown', 'terminal.theme', 'dark')).code).toBe(3);
  expect(file()).toBe(original);
});

test('projects trust approves the setup a repository names, records a receipt, and a change asks again', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const dir = join(cli.home, 'reef');
  mkdirSync(dir);
  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: reef\nworktrees:\n  setup: [/usr/bin/true, invented]\n',
  );
  const git = (...args: string[]) =>
    execFileSync('git', [
      '-C',
      dir,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      ...args,
    ]);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'first');
  await mesa('register', dir);
  const ran: string[][] = [];
  const real = withRealGit(cli.run);
  cli.run = (file, args, ms, options) => {
    if (file !== '/usr/bin/true') return real(file, args, ms, options);
    ran.push(args);
    return Promise.resolve({ ok: true, stdout: '' });
  };

  const refused = await mesa('worktrees', 'create', 'reef', 'feature', '--json');
  expect(refused.code).toBe(10);
  expect(refused.json.error).toMatchObject({ code: 'needs_approval' });
  expect(refused.json.error.message).toContain('setup ["/usr/bin/true","invented"]');
  const fingerprint = sha256(['/usr/bin/true', 'invented']);
  expect(refused.json.error.message).toContain(`mesa projects trust reef --expect ${fingerprint}`);
  expect((await mesa('projects', '--json')).json.data[0].unapproved).toEqual({
    setup: { argv: ['/usr/bin/true', 'invented'], fingerprint },
  });

  // From an agent's shell in a Mesa window, approval is refused with where it must come from.
  cli.env = { MESA_SESSION_ID: 'a1b2c3d4' };
  const inside = await mesa('projects', 'trust', 'reef', '--expect', fingerprint, '--json');
  expect(inside.code).toBe(2);
  expect(inside.json.error.message).toBe(
    'worktree scripts can only be approved from the Mesa app or a terminal outside a Mesa session',
  );
  cli.env = {};
  // With no terminal to confirm in, trust names the scripts and wants their fingerprints.
  const unreviewed = await mesa('projects', 'trust', 'reef', '--json');
  expect(unreviewed.code).toBe(2);
  expect(unreviewed.json.error.message).toContain(
    `review reef's setup ["/usr/bin/true","invented"] (${fingerprint}), then run mesa projects trust reef --expect ${fingerprint}`,
  );
  const trusted = await mesa('projects', 'trust', 'reef', '--expect', fingerprint, '--json');
  expect(trusted.code).toBe(0);
  expect(trusted.json.data).toMatchObject({
    project: 'reef',
    setup: ['/usr/bin/true', 'invented'],
  });
  expect(trusted.json.data.receipt).toMatchObject({ id: expect.any(String) });
  expect((await mesa('receipts', '--json')).json.data[0]).toMatchObject({
    summary: 'Approved worktree scripts in reef',
  });
  expect((await mesa('worktrees', 'create', 'reef', 'feature')).code).toBe(0);
  expect(ran).toEqual([['invented']]);

  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: reef\nworktrees:\n  setup: [/usr/bin/true, changed]\n',
  );
  expect((await mesa('worktrees', 'create', 'reef', 'second')).code).toBe(10);
  // The fingerprint reviewed before the change approves nothing now.
  const stale = await mesa('projects', 'trust', 'reef', '--expect', fingerprint, '--json');
  expect(stale.code).toBe(2);
  expect(stale.json.error.message).toContain('changed since its scripts were reviewed');
  // In a terminal, trust shows the argv and its fingerprint and approves what was confirmed.
  cli.answer = false;
  expect((await mesa('projects', 'trust', 'reef')).code).toBe(2);
  cli.answer = true;
  expect((await mesa('projects', 'trust', 'reef')).stdout).toBe(
    'approved setup ["/usr/bin/true","changed"] for reef\n',
  );
  expect(cli.asked.at(-1)).toBe(
    `reef's mesa.yaml runs setup ["/usr/bin/true","changed"] (${sha256(['/usr/bin/true', 'changed'])}) without a shell in its worktrees. Approve?`,
  );
  expect((await mesa('worktrees', 'create', 'reef', 'second')).code).toBe(0);
  expect(ran.at(-1)).toEqual(['changed']);
});
