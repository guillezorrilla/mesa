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

test('scheduler JSON commands install only explicitly and preserve pending approval across invocations', async () => {
  let loaded = false;
  cli.run = async (file, args) => {
    if (file === '/usr/bin/id') return { ok: true, stdout: '501' };
    if (file === '/bin/launchctl') {
      if (args[0] === 'bootstrap') loaded = true;
      if (args[0] === 'bootout') loaded = false;
      return loaded || args[0] !== 'print'
        ? { ok: true, stdout: '' }
        : { ok: false, reason: 'failed', detail: 'no job' };
    }
    return { ok: true, stdout: '' };
  };
  cli.deps.clock = () => new Date('2026-10-02T12:00:05Z');
  await cli.mesa('init', '--vault', 'vault');
  const project = join(cli.home, 'lantern-cove');
  mkdirSync(project);
  await cli.mesa('register', project, '--create');
  expect((await cli.mesa('automations', 'tick', '--json')).json.data.inert).toBe(true);
  expect((await cli.mesa('automations', 'status', '--json')).json.data).toMatchObject({
    installed: false,
    loaded: false,
  });
  await cli.mesa(
    'automations',
    'add',
    '{name: tides, project: lantern-cove, when: cron, cron: "*/2 * * * *", run: open, goal: Review tides, guardrail: ask}',
  );
  expect((await cli.mesa('automations', 'install', '--json')).json.data.loaded).toBe(true);
  expect((await cli.mesa('automations', 'tick', '--json')).code).toBe(0);
  const pending = (await cli.mesa('automations', 'status', '--json')).json.data.runs[0];
  expect(pending.status).toBe('pending');
  expect((await cli.mesa('automations', 'approve', pending.id, '--json')).json.data).toMatchObject({
    status: 'queued',
    approved: true,
  });
  expect((await cli.mesa('automations', 'cancel', pending.id, '--json')).json.data.status).toBe(
    'cancelled',
  );
  const status = (await cli.mesa('automations', 'uninstall', '--json')).json.data;
  expect(status).toMatchObject({ installed: false, loaded: false });
  expect(existsSync(status.plist)).toBe(false);
});
