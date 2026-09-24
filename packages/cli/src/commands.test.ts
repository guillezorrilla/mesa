import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '@mesa/core';
import { scriptedRunner, tempDir, testDeps } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { runCli, VERSION } from './cli.js';
import { COMMANDS } from './commands/index.js';

// Every real command through runCli, against a temp home: nothing here touches the real HOME.
let home: string;
let run: Runner;
beforeEach(() => {
  home = tempDir();
  run = scriptedRunner({ tmux: 'tmux 3.7c', claude: '2.1.282 (Claude Code)' }).run;
});
const mesa = async (...argv: string[]) => {
  const out = await runCli(argv, { commands: COMMANDS, env: {}, mesa: testDeps(home, { run }) });
  return { ...out, json: out.stdout.startsWith('{') ? JSON.parse(out.stdout) : undefined };
};

test('init, then a second init, then a second profile', async () => {
  expect((await mesa('init', '--vault', 'vault')).stdout).toBe(
    `initialised profile default at ${home}/.mesa/default/config.yaml\n`,
  );
  expect(readFileSync(join(home, '.mesa/default/config.yaml'), 'utf8')).toContain(
    `vault: ${home}/vault`,
  );
  expect((await mesa('init', '--vault', 'vault')).stdout).toBe(
    'profile default already initialised\n',
  );
  expect((await mesa('--profile', 'work', 'init', '--vault', '/tmp/w')).code).toBe(0);
  expect(await mesa('init')).toMatchObject({
    code: 2,
    stderr: '--vault is required. Usage: mesa init --vault <value> [flags]\n',
  });
});

test('config prints redacted, config set writes one field', async () => {
  await mesa('init', '--vault', '/tmp/v');
  expect((await mesa('config', 'set', 'keys.jev', 'env:JEV')).stdout).toBe('keys.jev = "***"\n');
  expect((await mesa('config', 'set', 'defaultAgent', 'codex')).stdout).toBe(
    'defaultAgent = "codex"\n',
  );
  const { json } = await mesa('config', '--json');
  expect(json.data).toMatchObject({ vault: '/tmp/v', defaultAgent: 'codex', keys: { jev: '***' } });
  expect((await mesa('config', 'set', 'decisions.threshold', '3')).code).toBe(4);
  expect((await mesa('config', 'set', 'onlypath')).code).toBe(2);
  expect((await mesa('--profile', 'none', 'config')).code).toBe(3);
});

test('register, projects, unregister', async () => {
  await mesa('init', '--vault', '/tmp/v');
  mkdirSync(join(home, 'lantern-cove'));
  expect((await mesa('register', 'lantern-cove')).code).toBe(3);
  expect((await mesa('register', 'lantern-cove', '--create')).stdout).toBe(
    `registered lantern-cove at ${home}/lantern-cove (wrote mesa.yaml)\n`,
  );
  expect((await mesa('register', 'lantern-cove')).code).toBe(4);
  const { json } = await mesa('projects', '--json');
  expect(json.data).toEqual([
    {
      name: 'lantern-cove',
      path: `${home}/lantern-cove`,
      agent: 'claude',
      priority: 0.5,
      skills: [],
      exists: true,
    },
  ]);
  expect((await mesa('projects')).stdout).toBe(`lantern-cove  ${home}/lantern-cove  claude  0.5\n`);
  expect((await mesa('unregister', 'lantern-cove')).stdout).toBe('unregistered lantern-cove\n');
  expect((await mesa('projects')).stdout).toBe(
    'no projects registered; run mesa register <path>\n',
  );
});

test('doctor reports { healthy, checks } and exits 3 when unhealthy', async () => {
  const healthy = await mesa('doctor', '--json');
  expect(healthy.code).toBe(0);
  expect(healthy.json.data.healthy).toBe(true);
  expect(healthy.json.data.checks.map((c: { name: string }) => c.name)).toEqual([
    'tmux',
    'claude',
    'codex',
    'obsidian',
    'profile dir',
  ]);

  run = scriptedRunner({}, { missing: ['tmux', 'claude', 'codex'] }).run;
  const sick = await mesa('doctor');
  expect(sick.code).toBe(3);
  expect(sick.stdout).toMatch(/^FAIL {2}tmux/);
  expect(sick.stdout).toMatch(/\nFAIL {2}claude/);
  expect(sick.stdout).toContain('doctor: tmux and at least one agent');
});

test('profile and version', async () => {
  expect((await mesa('profile', '--json')).json).toEqual({
    ok: true,
    data: { profile: 'default', dir: `${home}/.mesa/default` },
  });
  expect((await mesa('--version')).stdout).toBe(`${VERSION}\n`);
});
