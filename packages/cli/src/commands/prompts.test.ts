import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('prompts JSON preserves multiline text and isolates profiles', async () => {
  const { mesa } = cli;
  await mesa('init', '--vault', 'vault');
  await mesa('--profile', 'other', 'init', '--vault', 'other-vault');
  const text = 'Line one\n\n  line three\n';
  expect((await mesa('prompts', 'save', 'Review', text, '--json')).json.data).toEqual({
    name: 'Review',
    text,
  });
  expect((await mesa('prompts', '--json')).json.data).toEqual([{ name: 'Review', text }]);
  expect((await mesa('--profile', 'other', 'prompts', '--json')).json.data).toEqual([]);
  expect((await mesa('prompts', 'save', 'review', 'wrong')).code).toBe(2);
  expect(
    (await mesa('prompts', 'save', 'Review', 'replacement', '--replace', '--json')).json.data,
  ).toEqual({
    name: 'Review',
    text: 'replacement',
  });
  expect((await mesa('prompts', 'remove', 'Review', '--json')).json.data).toEqual({
    name: 'Review',
  });
  expect((await mesa('prompts', '--json')).json.data).toEqual([]);
});
