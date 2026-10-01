import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

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
  expect((await mesa('projects', '--sort', 'bad', '--json')).code).toBe(2);
  expect((await mesa('projects', 'visit', 'absent', '--json')).code).toBe(3);
  expect((await mesa('receipts', '--json')).json.data).toEqual(before);
});
