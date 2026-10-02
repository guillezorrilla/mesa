import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { VERSION } from '../cli.js';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('init, then a second init, then a second profile', async () => {
  const first = (await mesa('init', '--vault', 'vault')).stdout;
  expect(first.split('\n')[0]).toBe(`initialised profile default at ${cli.paths.config}`);
  expect(first).not.toContain('warning:');
  expect(readFileSync(cli.paths.config, 'utf8')).toContain(`vault: ${cli.home}/vault`);
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
  expect((await mesa('config', 'set', 'shortcuts.search', 'Mod+P', '--json')).json.data.value).toBe(
    'Mod+P',
  );
  expect((await mesa('config', 'set', 'shortcuts.board', 'Mod+P')).code).toBe(4);
  expect((await mesa('config', 'set', 'onlypath')).code).toBe(2);
  expect((await mesa('--profile', 'none', 'config')).code).toBe(3);
});

test('config set redacts key values without routine vault history', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const set = (await mesa('config', 'set', 'keys.api', 'sk-x', '--json')).json.data;
  expect(set).toMatchObject({
    path: 'keys.api',
    value: '***',
    receipt: null,
  });
  expect(JSON.stringify(set)).not.toContain('sk-x');
  expect((await mesa('config', 'set', 'keys.api', 'sk-x', '--json')).json.data.receipt).toBeNull();

  await mesa('config', 'set', 'terminal.app', 'iTerm');
  const listed = (await mesa('receipts', '--json')).json.data;
  expect(listed).toEqual([]);

  // A key under a mistyped path fails without leaking the value into history.
  expect((await mesa('config', 'set', 'key.openai', 'sk-live-abcdef', '--json')).code).toBe(4);
  const failed = (await mesa('receipts', '--json')).json.data;
  expect(failed).toEqual([]);
  expect(JSON.stringify(failed)).not.toContain('sk-live-abcdef');
});

test('config set vault records departure and arrival, readable in both vaults', async () => {
  const oldVault = join(cli.home, 'old-secret-marker');
  const newVault = join(cli.home, 'new-secret-marker');
  await mesa('init', '--vault', oldVault);
  await mesa('vault', 'init');
  await mesa('--profile', 'old-reader', 'init', '--vault', oldVault);
  await mesa('--profile', 'arrival', 'init', '--vault', newVault);
  await mesa('--profile', 'arrival', 'vault', 'init');

  await mesa('config', 'set', 'keys.api', 'secret-marker');
  const switched = await mesa('config', 'set', 'vault', newVault, '--json');
  expect(switched.code).toBe(0);
  expect(switched.json.data.receipt).not.toBeNull();
  expect(switched.json.data.warning).toBeUndefined();
  expect((await mesa('config', '--json')).json.data.vault).toBe(newVault);
  for (const profile of ['old-reader', 'default']) {
    const entries = (await mesa('--profile', profile, 'receipts', '--json')).json.data;
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.receipt).toMatchObject({
      type: 'action',
      kind: 'vault-change',
      profile: 'default',
      status: 'ok',
      inputs: { path: 'vault', vault: '~/old-***' },
      outputs: { value: '~/new-***' },
    });
    expect(JSON.stringify(entry)).not.toContain(cli.home);
    expect(JSON.stringify(entry)).not.toContain('secret-marker');
    expect(
      (await mesa('--profile', profile, 'receipts', 'show', entry.receipt.id, '--json')).json.data,
    ).toEqual(entry);
    const vault = profile === 'old-reader' ? oldVault : newVault;
    expect(readFileSync(join(vault, 'log.md'), 'utf8')).toContain(entry.path.replace(/\.md$/, ''));
    if (profile === 'default') expect(switched.json.data.receipt.id).toBe(entry.receipt.id);
  }
  expect((await mesa('config', 'set', 'vault', newVault, '--json')).json.data.receipt).toBeNull();
  expect((await mesa('config', 'set', 'vault', 'relative', '--json')).code).toBe(4);
  for (const profile of ['old-reader', 'default'])
    expect((await mesa('--profile', profile, 'receipts', '--json')).json.data).toHaveLength(1);
});

test.each(['old', 'new'])(
  'a failed %s vault receipt does not prevent the other or the config switch',
  async (failed) => {
    const oldVault = join(cli.home, 'old-vault');
    const newVault = join(cli.home, 'new-vault');
    await mesa('init', '--vault', oldVault);
    await mesa('vault', 'init');
    await mesa('--profile', 'old-reader', 'init', '--vault', oldVault);
    await mesa('--profile', 'arrival', 'init', '--vault', newVault);
    await mesa('--profile', 'arrival', 'vault', 'init');
    const broken = failed === 'old' ? oldVault : newVault;
    rmSync(join(broken, 'receipts'), { recursive: true });
    writeFileSync(join(broken, 'receipts'), 'not a folder');

    const switched = await mesa('config', 'set', 'vault', newVault, '--json');
    expect(switched.code).toBe(0);
    expect(switched.json.data.warning).toContain('no receipt:');
    if (failed === 'new') expect(switched.json.data.receipt).toBeNull();
    else expect(switched.json.data.receipt).not.toBeNull();
    expect((await mesa('config', '--json')).json.data.vault).toBe(newVault);
    const goodProfile = failed === 'old' ? 'default' : 'old-reader';
    expect((await mesa('--profile', goodProfile, 'receipts', '--json')).json.data).toHaveLength(1);
  },
);

test('profile and version', async () => {
  expect((await mesa('profile', '--json')).json).toEqual({
    ok: true,
    data: { profile: 'default', dir: cli.paths.root },
  });
  expect((await mesa('--version')).stdout).toBe(`${VERSION}\n`);
});
