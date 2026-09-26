import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('vault init lays out the vault once; vault status finds what is missing', async () => {
  await mesa('init', '--vault', 'vault');
  // mesa init already wrote its receipt, so receipts/ exists and vault init adds the rest.
  expect((await mesa('vault', 'init')).stdout).toBe(
    `created log.md, AGENTS.md, index.md, raw, wiki, projects, daily in ${cli.home}/vault\n`,
  );
  const log = readFileSync(join(cli.home, 'vault/log.md'), 'utf8').split('\n');
  expect(log[0]).toBe('- 2026-09-24T12:00:00.000Z vault initialised by mesa');
  // vault init's own receipt, linked from the log.
  expect(log[1]).toMatch(
    /^- 2026-09-24T12:00:00\.000Z Laid out the vault: .* \[\[receipts\/2026\/09\/20260924T120000Z-action-01TEST\d+\|receipt\]\]$/,
  );
  expect((await mesa('vault', 'init')).stdout).toBe('vault already initialised\n');
  expect((await mesa('vault', 'status', '--json')).json.data).toEqual({
    path: `${cli.home}/vault`,
    ok: true,
    missing: [],
  });

  rmSync(join(cli.home, 'vault/receipts'), { recursive: true });
  const status = await mesa('vault', 'status', '--json');
  expect(status.code).toBe(3);
  expect(status.json.data).toMatchObject({ ok: false, missing: ['receipts'] });

  const group = await mesa('vault');
  expect(group.code).toBe(2);
  expect(group.stderr).toContain('vault init');
  expect(group.stderr).toContain('vault status');
});

test('vault init refuses a non-empty folder that is not a vault unless --force', async () => {
  mkdirSync(join(cli.home, 'repo'));
  writeFileSync(join(cli.home, 'repo/README.md'), 'a repo\n');
  await mesa('init', '--vault', 'repo');
  expect((await mesa('vault', 'init')).code).toBe(4);
  expect((await mesa('vault', 'init', '--force')).code).toBe(0);
  expect(readFileSync(join(cli.home, 'repo/README.md'), 'utf8')).toBe('a repo\n');
});

test('log appends to log.md and to the daily note it creates', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('log', 'hello')).code).toBe(3); // the vault is not laid out yet
  await mesa('vault', 'init');
  const out = await mesa('log', 'hello', '--json');
  expect(out.code).toBe(0);
  expect(out.json.data.entry).toBe('- 2026-09-24T12:00:00.000Z hello');
  expect(readFileSync(join(cli.home, 'vault/log.md'), 'utf8').trimEnd().split('\n').at(-1)).toBe(
    '- 2026-09-24T12:00:00.000Z hello',
  );
  const daily = readFileSync(join(cli.home, 'vault', out.json.data.daily), 'utf8');
  expect(daily).toMatch(/^---\ncreated: /);
  expect(daily.trimEnd().endsWith('- 2026-09-24T12:00:00.000Z hello')).toBe(true);
  expect((await mesa('log')).code).toBe(2);
});

test('init, register, and vault init each leave an action receipt; receipts lists and shows them', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'tide'));
  await mesa('register', 'tide', '--create');
  await mesa('vault', 'init');
  await mesa('vault', 'init'); // nothing to do: no receipt

  const listed = await mesa('receipts', '--json', '--limit', '20');
  const kinds = listed.json.data.map(
    (e: { receipt: { type: string; command: string } }) => e.receipt,
  );
  expect(kinds.map((r: { type: string }) => r.type)).toEqual(['action', 'action', 'action']);
  expect(kinds.map((r: { command: string }) => r.command).sort()).toEqual([
    'mesa init --vault vault',
    'mesa register tide --create',
    'mesa vault init',
  ]);
  const first = listed.json.data[0];
  expect(first.receipt).toMatchObject({
    profile: 'default',
    status: 'ok',
    id: expect.stringMatching(/^01TEST/),
  });

  const shown = await mesa('receipts', 'show', first.receipt.id, '--json');
  expect(shown.json.data.receipt).toEqual(first.receipt);
  expect((await mesa('receipts', 'show', '01NOPE')).code).toBe(3);
  expect(await mesa('receipts', '--limit', 'zero')).toMatchObject({
    code: 2,
    stderr: '--limit must be a whole number, not zero\n',
  });
  expect(await mesa('receipts', '--limit', '0')).toMatchObject({
    code: 2,
    stderr: 'the limit must be a positive whole number, not 0\n',
  });
  expect((await mesa('receipts', '--limit', '1', '--json')).json.data).toHaveLength(1);
});

test('a vault path that is not a vault gets no receipt, only a warning; a failed register is recorded', async () => {
  mkdirSync(join(cli.home, 'repo/.git'), { recursive: true });
  writeFileSync(join(cli.home, 'repo/README.md'), 'a repo\n');
  const out = await mesa('init', '--vault', 'repo');
  expect(out.code).toBe(0);
  expect(out.stdout).toContain(
    `warning: no receipt: ${cli.home}/repo is not a vault; run mesa vault init`,
  );
  expect(() => readFileSync(join(cli.home, 'repo/receipts'))).toThrow();
  const json = await mesa('--profile', 'json', 'init', '--vault', 'repo', '--json');
  expect(json.json.data).toMatchObject({
    receipt: null,
    warning: expect.stringContaining('is not a vault'),
  });

  await mesa('--profile', 'work', 'init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'nomesa'));
  expect((await mesa('--profile', 'work', 'register', 'nomesa')).code).toBe(3);
  const listed = await mesa('--profile', 'work', 'receipts', '--json');
  const failed = listed.json.data.find(
    (e: { receipt: { status: string } }) => e.receipt.status === 'failed',
  );
  expect(failed.receipt.outputs.error.code).toBe('not_found');
  expect(failed.summary).toBe(`Could not register ${cli.home}/nomesa`);
});

test('a receipt problem never changes the outcome of the action it records', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(cli.home, 'tide'));
  chmodSync(join(cli.home, 'vault/log.md'), 0o000); // acceptsMesaWrites cannot read the log mark
  try {
    const ok = await mesa('register', 'tide', '--create');
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('registered tide');
    expect(ok.stdout).toContain('warning: no receipt:');
    const missing = await mesa('register', 'nowhere');
    expect(missing.code).toBe(3); // the real error, not the receipt's
  } finally {
    chmodSync(join(cli.home, 'vault/log.md'), 0o644);
  }
});

test('vault open: the URI by default, --json, and its errors', async () => {
  // No profile yet: the same error every command gives.
  const before = await mesa('vault', 'open');
  expect([before.code, before.stderr]).toEqual([
    3,
    `${cli.home}/.mesa/default/config.yaml not found; run mesa init --vault <path>\n`,
  ]);
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  // A config that does not read says why, as vault status does, not "no vault".
  const config = join(cli.home, '.mesa/default/config.yaml');
  const good = readFileSync(config, 'utf8');
  writeFileSync(config, `${good}surprise: 1\n`);
  const broken = await mesa('vault', 'open');
  expect(broken.code).toBe(4);
  expect(broken.stderr).toMatch(/config\.yaml.*surprise/);
  writeFileSync(config, good);
  const list = join(cli.home, 'obsidian/obsidian.json');
  mkdirSync(join(cli.home, 'obsidian'), { recursive: true });
  writeFileSync(list, JSON.stringify({ vaults: { a1: { path: join(cli.home, 'vault'), ts: 1 } } }));

  const opened = await mesa('vault', 'open', '--json');
  expect(opened.json).toEqual({
    ok: true,
    data: { opened: true, method: 'uri', target: 'obsidian://open?vault=vault' },
  });
  const { daily } = (await mesa('log', 'hello', '--json')).json.data;
  const note = await mesa('vault', 'open', daily, '--json');
  expect(note.json.data.target).toBe(
    `obsidian://open?vault=vault&file=${encodeURIComponent(daily)}`,
  );
  expect((await mesa('vault', 'open', 'wiki/missing.md')).code).toBe(3);
});
