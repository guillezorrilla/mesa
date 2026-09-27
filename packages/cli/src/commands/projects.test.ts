import { mkdirSync } from 'node:fs';
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
  expect(gone).toMatchObject({ name: 'lantern-cove', receipt: { id: expect.any(String) } });
  const shown = (await mesa('receipts', 'show', gone.receipt.id, '--json')).json.data;
  expect(shown.summary).toBe('Unregistered project lantern-cove');
  expect(shown.receipt).toMatchObject({ type: 'action', project: 'lantern-cove' });
  expect((await mesa('projects')).stdout).toBe(
    'no projects registered; run mesa register <path>\n',
  );
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
