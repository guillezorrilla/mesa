import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('backup create and separate-profile restore work through JSON commands', async () => {
  const { mesa } = cli;
  await mesa('init', '--vault', 'source-vault');
  await mesa('config', 'set', 'keys.api', 'sk-invented-secret');
  await mesa('prompts', 'save', 'Review', 'Line one\n\nLine three');
  const created = (await mesa('backup', 'create', '--json')).json.data;
  expect(created).toMatchObject({ retained: 5 });
  const vault = join(cli.home, 'new-vault');
  const restored = await mesa(
    '--profile',
    'restored',
    'backup',
    'restore',
    '--vault',
    vault,
    created.path,
    '--json',
  );
  expect(restored.json.data).toMatchObject({ profile: 'restored', vault, prompts: 1 });
  expect((await mesa('--profile', 'restored', 'prompts', '--json')).json.data).toEqual([
    { name: 'Review', text: 'Line one\n\nLine three' },
  ]);
  expect((await mesa('--profile', 'restored', 'config', '--json')).json.data.keys).toEqual({});
  expect(
    (
      await mesa(
        '--profile',
        'restored',
        'backup',
        'restore',
        '--vault',
        join(cli.home, 'other-vault'),
        created.path,
      )
    ).code,
  ).toBe(2);
});
