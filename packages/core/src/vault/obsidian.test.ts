import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { scriptedRunner, tempDir, testDeps } from '../testing/index.js';
import { obsidianUri, openInObsidian } from './obsidian.js';

let home: string;
let vault: string;
let obsidian: ReturnType<typeof testDeps>['obsidian'];
beforeEach(() => {
  home = tempDir();
  vault = join(home, 'Lantern Cove');
  obsidian = testDeps(home).obsidian;
  mkdirSync(join(vault, 'daily'), { recursive: true });
  writeFileSync(join(vault, 'daily', '2026-09-25.md'), '# 2026-09-25\n');
  know(vault);
});

/** Sets the fake Obsidian vault list to `paths`, as "Open folder as vault" would build it. */
function know(...paths: string[]) {
  mkdirSync(dirname(obsidian.vaultList), { recursive: true });
  const vaults = Object.fromEntries(
    paths.map((path, i) => [`a1b2c3d4e5f6071${i}`, { path, ts: 1 }]),
  );
  writeFileSync(obsidian.vaultList, JSON.stringify({ vaults }));
}

test('the URI names the vault by its folder and encodes every value', () => {
  expect(obsidianUri('/v/Lantern Cove')).toBe('obsidian://open?vault=Lantern%20Cove');
  expect(obsidianUri('/v/Lantern Cove', 'daily/2026-09-25.md')).toBe(
    'obsidian://open?vault=Lantern%20Cove&file=daily%2F2026-09-25.md',
  );
});

test('by default it opens the vault or a note with macOS open and the URI', async () => {
  const { run, calls } = scriptedRunner();
  expect(await openInObsidian({ run, obsidian }, { vault })).toEqual({
    opened: true,
    method: 'uri',
    target: 'obsidian://open?vault=Lantern%20Cove',
  });
  await openInObsidian({ run, obsidian }, { vault, note: 'daily/2026-09-25' });
  expect(calls.map((c) => [c.file, ...c.args])).toEqual([
    ['open', 'obsidian://open?vault=Lantern%20Cove'],
    ['open', 'obsidian://open?vault=Lantern%20Cove&file=daily%2F2026-09-25.md'],
  ]);
});

test('an item opens exactly as named: a canvas, a file with no extension, a dotted note name', async () => {
  mkdirSync(join(vault, 'raw'));
  for (const file of ['raw/map.canvas', 'raw/LICENSE', 'raw/v1.2.md'])
    writeFileSync(join(vault, file), '{}');
  const { run, calls } = scriptedRunner();
  for (const note of ['raw/map.canvas', 'raw/LICENSE', 'raw/v1.2']) {
    await openInObsidian({ run, obsidian }, { vault, note });
  }
  expect(calls.map((c) => c.args[0])).toEqual([
    'obsidian://open?vault=Lantern%20Cove&file=raw%2Fmap.canvas',
    'obsidian://open?vault=Lantern%20Cove&file=raw%2FLICENSE',
    'obsidian://open?vault=Lantern%20Cove&file=raw%2Fv1.2.md',
  ]);
});

test('--cli uses the registered CLI for a note, and falls back to the URI when the app is closed', async () => {
  mkdirSync(dirname(obsidian.registered), { recursive: true });
  writeFileSync(obsidian.registered, '');
  const running = scriptedRunner();
  const viaCli = await openInObsidian(
    { run: running.run, obsidian },
    { vault, note: 'daily/2026-09-25.md', cli: true },
  );
  expect(viaCli).toMatchObject({ method: 'cli', target: 'daily/2026-09-25.md' });
  expect(running.calls[0]?.args).toEqual([
    'vault=Lantern Cove',
    'open',
    'path=daily/2026-09-25.md',
  ]);

  const closed = scriptedRunner({}, { failing: [obsidian.registered] });
  const fellBack = await openInObsidian(
    { run: closed.run, obsidian },
    { vault, note: 'daily/2026-09-25.md', cli: true },
  );
  expect(fellBack.method).toBe('uri');
  expect(closed.calls.map((c) => c.file)).toEqual([obsidian.registered, 'open']);
});

test('--cli without a registered CLI, or for the whole vault, uses the URI', async () => {
  const { run, calls } = scriptedRunner();
  expect(
    (await openInObsidian({ run, obsidian }, { vault, note: 'daily/2026-09-25.md', cli: true }))
      .method,
  ).toBe('uri');
  expect((await openInObsidian({ run, obsidian }, { vault, cli: true })).method).toBe('uri');
  expect(calls.every((c) => c.file === 'open')).toBe(true);
});

test('a missing note is not_found, a missing vault invalid_config, and nothing is opened', async () => {
  const { run, calls } = scriptedRunner();
  await expect(
    openInObsidian({ run, obsidian }, { vault, note: 'wiki/nope' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    openInObsidian({ run, obsidian }, { vault, note: '../outside.md' }),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    openInObsidian({ run, obsidian }, { vault: join(home, 'gone') }),
  ).rejects.toMatchObject({
    code: 'invalid_config',
  });
  expect(calls).toEqual([]);
});

test('a vault Obsidian does not know is not_found with how to add it, instead of its dialog', async () => {
  know(join(home, 'another'));
  const { run, calls } = scriptedRunner();
  await expect(openInObsidian({ run, obsidian }, { vault })).rejects.toMatchObject({
    code: 'not_found',
    message: expect.stringContaining('Open folder as vault'),
  });
  expect(calls).toEqual([]);
  // No vault list at all: Obsidian knows no vault.
  const noList = { ...obsidian, vaultList: join(home, 'no-such-list.json') };
  await expect(openInObsidian({ run, obsidian: noList }, { vault })).rejects.toMatchObject({
    code: 'not_found',
  });
});

test('two known vaults with the same folder name are refused, not guessed', async () => {
  know(vault, join(home, 'elsewhere', 'Lantern Cove'));
  const { run, calls } = scriptedRunner();
  await expect(openInObsidian({ run, obsidian }, { vault })).rejects.toMatchObject({
    code: 'invalid_config',
    message: expect.stringContaining('2 vaults named Lantern Cove'),
  });
  expect(calls).toEqual([]);
});
