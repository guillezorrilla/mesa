import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('config --json carries the diff and file tree sizes, and set rejects one out of range', async () => {
  await cli.mesa('init', '--vault', 'vault');
  expect((await cli.mesa('config', '--json')).json.data.appearance).toMatchObject({
    diffFontSize: 13,
    fileTreeFontSize: 14,
  });
  const set = await cli.mesa('config', 'set', 'appearance.diffFontSize', '18', '--json');
  expect(set.json.data.value).toBe(18);
  expect((await cli.mesa('config', 'set', 'appearance.fileTreeFontSize', '21')).code).toBe(4);
  expect((await cli.mesa('config', '--json')).json.data.appearance).toMatchObject({
    diffFontSize: 18,
    fileTreeFontSize: 14,
  });
});

test('terminal.messageActions is on by default and config set turns it off', async () => {
  await cli.mesa('init', '--vault', 'vault');
  const messageActions = async () =>
    (await cli.mesa('config', '--json')).json.data.terminal.messageActions;
  expect(await messageActions()).toBe(true);
  expect(
    (await cli.mesa('config', 'set', 'terminal.messageActions', 'false', '--json')).json.data,
  ).toMatchObject({ path: 'terminal.messageActions', value: false });
  expect(await messageActions()).toBe(false);
  expect((await cli.mesa('config', 'set', 'terminal.messageActions', 'maybe')).code).toBe(4);
});

test('terminal.newlineKey is shift-enter by default, and a profile that sets native keeps it', async () => {
  await cli.mesa('init', '--vault', 'vault');
  const newlineKey = async () => (await cli.mesa('config', '--json')).json.data.terminal.newlineKey;
  expect(await newlineKey()).toBe('shift-enter');
  await cli.mesa('config', 'set', 'terminal.newlineKey', 'native');
  expect(await newlineKey()).toBe('native');
});

test('terminal.theme takes a preset, and custom colors only as #rrggbb', async () => {
  await cli.mesa('init', '--vault', 'vault');
  expect((await cli.mesa('config', 'set', 'terminal.theme', 'dracula', '--json')).code).toBe(0);
  expect((await cli.mesa('config', '--json')).json.data.terminal.theme).toBe('dracula');
  for (const [path, value, named] of [
    ['terminal.theme', 'custom', 'terminal.colors'],
    ['terminal.colors.red', 'red', 'terminal.colors.red'],
    ['terminal.colors.purple', '"#ff00ff"', 'terminal.colors.purple'],
  ] as const) {
    const set = await cli.mesa('config', 'set', path, value, '--json');
    expect(set.code).toBe(4);
    expect(set.json.error).toMatchObject({ code: 'invalid_config' });
    expect(set.json.error.message).toContain(`${named}:`);
  }
});

test('changing the vault switches reads and writes without moving or changing existing notes', async () => {
  await cli.mesa('init', '--vault', 'first-vault');
  await cli.mesa('vault', 'init');
  const first = (await cli.mesa('config', '--json')).json.data.vault as string;
  writeFileSync(join(first, 'kept.md'), '# Keep this note\n');
  const second = join(first, '..', 'second vault');
  expect((await cli.mesa('config', 'set', 'vault', JSON.stringify(second), '--json')).code).toBe(0);
  expect((await cli.mesa('vault', 'status', '--json')).json.data.path).toBe(second);
  expect(existsSync(join(second, 'receipts'))).toBe(true);
  await cli.mesa('vault', 'init');
  const inventory = (await cli.mesa('vault', 'list', '--json')).json.data;
  expect(inventory.vault).toBe(second);
  expect(inventory.items.some((item: { path: string }) => item.path === 'kept.md')).toBe(false);
  expect(readFileSync(join(first, 'kept.md'), 'utf8')).toBe('# Keep this note\n');
  expect((await cli.mesa('config', 'set', 'vault', 'relative-folder', '--json')).code).toBe(4);
  expect((await cli.mesa('config', '--json')).json.data.vault).toBe(second);
});
