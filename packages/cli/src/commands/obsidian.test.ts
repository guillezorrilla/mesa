import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('obsidian vaults lists none before init and suggests ~/Documents/Mesa', async () => {
  const listed = await mesa('obsidian', 'vaults', '--json');
  expect(listed.code).toBe(0);
  expect(listed.json.data.vaults).toEqual([]);
  expect(listed.json.data.suggested).toMatch(/\/Documents\/Mesa$/);
});

test('obsidian manager opens the vault manager, before init too', async () => {
  const opened = await mesa('obsidian', 'manager', '--json');
  expect(opened.code).toBe(0);
  expect(opened.json.data).toEqual({ opened: true, target: 'obsidian://choose-vault' });
});
