import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('sessions controls, model and mode refuse a Terminal session and say how to switch', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  const hint = `session ${opened.id} is not in Structured view; mesa sessions view ${opened.id} structured first\n`;
  expect(await mesa('sessions', 'controls', opened.id)).toMatchObject({ code: 2, stderr: hint });
  expect(await mesa('sessions', 'model', opened.id, 'opus')).toMatchObject({
    code: 2,
    stderr: hint,
  });
  expect(await mesa('sessions', 'mode', opened.id, 'plan')).toMatchObject({
    code: 2,
    stderr: hint,
  });
});

test('sessions controls shows a Structured session with no reply yet from its record', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (
    await mesa(
      'open',
      'lantern-cove',
      '--no-parent',
      '--view',
      'structured',
      '--model',
      'haiku',
      '--json',
    )
  ).json.data;
  const shown = await mesa('sessions', 'controls', opened.id, '--json');
  expect(shown.json.data).toMatchObject({
    agent: 'claude',
    model: 'haiku',
    models: ['opus', 'sonnet', 'haiku', 'fable'],
  });
  expect((await mesa('sessions', 'controls', opened.id)).stdout).toBe(`${opened.id}: haiku\n`);
});

test('sessions config reads the named /config keys where Claude Code keeps them', async () => {
  cli.withTmux();
  await cli.withProject();
  writeFileSync(join(cli.home, '.claude.json'), JSON.stringify({ verbose: true, theme: 'dark' }));
  const opened = (
    await mesa('open', 'lantern-cove', '--no-parent', '--view', 'structured', '--json')
  ).json.data;
  const read = await mesa('sessions', 'config', opened.id, 'verbose', 'theme', 'buoy', '--json');
  expect(read.json.data).toEqual({ verbose: 'true', theme: 'dark' });
  expect((await mesa('sessions', 'config', opened.id, 'verbose')).stdout).toBe('verbose=true\n');
});
