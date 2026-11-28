import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

const shown = async (...args: string[]) =>
  (await mesa('sidebar', 'tabs', ...args, '--json')).json.data.tabs.map(
    (tab: { id: string; shown: boolean }) => `${tab.id}:${tab.shown ? 'on' : 'off'}`,
  );

test('sidebar tabs lists the tabs in order, and --hide and --show change an optional one', async () => {
  await mesa('init', '--vault', 'vault');
  expect(await shown()).toEqual(['sessions:on', 'projects:on', 'reviews:on', 'logs:on']);
  expect(await shown('--hide', 'reviews')).toEqual([
    'sessions:on',
    'projects:on',
    'reviews:off',
    'logs:on',
  ]);
  expect((await mesa('config', '--json')).json.data.sidebar.tabs).toEqual([
    { id: 'reviews', shown: false },
    { id: 'logs', shown: true },
  ]);
  expect(await shown('--show', 'reviews')).toContain('reviews:on');
  expect(await shown('--order', 'logs,reviews')).toEqual([
    'sessions:on',
    'projects:on',
    'logs:on',
    'reviews:on',
  ]);
  expect((await mesa('config', '--json')).json.data.sidebar.tabs).toEqual([
    { id: 'logs', shown: true },
    { id: 'reviews', shown: true },
  ]);
  await mesa('config', 'set', 'sidebar.tabStyle', 'icons');
  const text = (await mesa('sidebar', 'tabs')).stdout;
  expect(text).toMatch(/^sessions +shown +always$/m);
  expect(text).toContain('style: icons');
  expect((await mesa('help', '--agent')).stdout).toContain('mesa sidebar tabs');
});

test('sidebar tabs refuses a fixed or unknown tab, and two flags at once', async () => {
  await mesa('init', '--vault', 'vault');
  for (const args of [
    ['--hide', 'sessions'],
    ['--show', 'timeline'],
    ['--show', 'logs', '--hide', 'reviews'],
    ['--order', 'sessions,logs'],
    ['--order', 'logs', '--hide', 'reviews'],
  ]) {
    const refused = await mesa('sidebar', 'tabs', ...args, '--json');
    expect(refused.code).toBe(2);
    expect(refused.json.error).toMatchObject({ code: 'usage' });
  }
});

test('the retired logs.cloudTab still hides Logs until sidebar.tabs names it', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('config', 'set', 'logs.cloudTab', 'false');
  expect(await shown()).toContain('logs:off');
  expect(await shown('--show', 'logs')).toContain('logs:on');
  await mesa('config', 'set', 'logs.cloudTab', 'false');
  expect(await shown()).toContain('logs:on');
});
