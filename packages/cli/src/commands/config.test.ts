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
