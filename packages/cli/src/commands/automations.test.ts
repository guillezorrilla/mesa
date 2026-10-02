import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('automation CRUD JSON is inert, validated and isolated to its profile', async () => {
  const { mesa } = cli;
  await mesa('init', '--vault', 'vault');
  await mesa('--profile', 'other', 'init', '--vault', 'other-vault');
  const project = join(cli.home, 'lantern-cove');
  mkdirSync(project);
  expect((await mesa('register', project, '--create')).code).toBe(0);
  const config = readFileSync(cli.paths.config);
  expect((await mesa('automations', 'list', '--json')).json.data).toEqual([]);
  expect(existsSync(cli.paths.automations)).toBe(false);
  const definition =
    '{name: refresh-docs, project: lantern-cove, when: cron, cron: "*/2 * * * *", run: refresh, notes: false, guardrail: allow}';
  expect((await mesa('automations', 'add', definition, '--json')).json.data).toMatchObject({
    name: 'refresh-docs',
    enabled: true,
    notes: false,
  });
  expect((await mesa('automations', 'disable', 'refresh-docs', '--json')).json.data.enabled).toBe(
    false,
  );
  expect((await mesa('automations', 'enable', 'refresh-docs', '--json')).json.data.enabled).toBe(
    true,
  );
  expect((await mesa('--profile', 'other', 'automations', 'list', '--json')).json.data).toEqual([]);
  const bytes = readFileSync(cli.paths.automations);
  expect((await mesa('automations', 'add', definition, '--json')).code).toBe(2);
  expect((await mesa('automations', 'add', '{', '--json')).json.error.code).toBe('usage');
  expect(
    (await mesa('automations', 'add', definition.replace('*/2', '*/0'), '--json')).json.error.code,
  ).toBe('invalid_config');
  expect(readFileSync(cli.paths.automations)).toEqual(bytes);
  expect((await mesa('automations', 'remove', 'refresh-docs', '--json')).json.data.name).toBe(
    'refresh-docs',
  );
  expect((await mesa('automations', 'list', '--json')).json.data).toEqual([]);
  expect(readFileSync(cli.paths.config)).toEqual(config);
});
