import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { VERSION } from '../cli.js';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('init, then a second init, then a second profile', async () => {
  const first = (await mesa('init', '--vault', 'vault')).stdout;
  expect(first.split('\n')[0]).toBe(
    `initialised profile default at ${cli.home}/.mesa/default/config.yaml`,
  );
  // The receipt is written; its log.md line waits for mesa vault init.
  expect(first).toContain(
    `warning: no log line: ${cli.home}/vault/log.md not found; run mesa vault init`,
  );
  expect(readFileSync(join(cli.home, '.mesa/default/config.yaml'), 'utf8')).toContain(
    `vault: ${cli.home}/vault`,
  );
  expect((await mesa('init', '--vault', 'vault')).stdout).toBe(
    'profile default already initialised\n',
  );
  expect((await mesa('--profile', 'work', 'init', '--vault', '/tmp/w')).code).toBe(0);
  expect(await mesa('init')).toMatchObject({
    code: 2,
    stderr: '--vault is required. Usage: mesa init --vault <string> [flags]\n',
  });
});

test('config prints redacted, config set writes one field', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  expect((await mesa('config', 'set', 'keys.jev', 'env:JEV')).stdout).toBe('keys.jev = "***"\n');
  expect((await mesa('config', 'set', 'defaultAgent', 'codex')).stdout).toBe(
    'defaultAgent = "codex"\n',
  );
  const { json } = await mesa('config', '--json');
  expect(json.data).toMatchObject({
    vault: `${cli.home}/vault`,
    defaultAgent: 'codex',
    keys: { jev: '***' },
  });
  expect((await mesa('config', 'set', 'decisions.threshold', '3')).code).toBe(4);
  expect((await mesa('config', 'set', 'onlypath')).code).toBe(2);
  expect((await mesa('--profile', 'none', 'config')).code).toBe(3);
});

test('config set leaves an action receipt with key values redacted, and none when unchanged', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const set = (await mesa('config', 'set', 'keys.api', 'sk-x', '--json')).json.data;
  expect(set).toMatchObject({
    path: 'keys.api',
    value: '***',
    receipt: { id: expect.any(String) },
  });
  const shown = (await mesa('receipts', 'show', set.receipt.id, '--json')).json.data;
  expect(shown.summary).toBe('Set config keys.api');
  expect(shown.receipt).toMatchObject({
    type: 'action',
    command: 'mesa config set keys.api *** --json',
    outputs: { value: '***' },
  });
  expect(JSON.stringify(shown)).not.toContain('sk-x');
  expect((await mesa('config', 'set', 'keys.api', 'sk-x', '--json')).json.data.receipt).toBeNull();

  await mesa('config', 'set', 'terminal.app', 'iTerm');
  const listed = (await mesa('receipts', '--json')).json.data;
  expect(listed[0].summary).toBe('Set config terminal.app');
});

test('profile and version', async () => {
  expect((await mesa('profile', '--json')).json).toEqual({
    ok: true,
    data: { profile: 'default', dir: `${cli.home}/.mesa/default` },
  });
  expect((await mesa('--version')).stdout).toBe(`${VERSION}\n`);
});
