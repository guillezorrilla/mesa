import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('sessions view switches a Terminal session to Structured in its window, once', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  const switched = await mesa('sessions', 'view', opened.id, 'structured', '--json');
  expect(switched.code, switched.stderr).toBe(0);
  expect(switched.json.data).toMatchObject({ id: opened.id, view: 'structured', switched: true });
  const windows = world.windows.filter((w) => w.window === opened.tmux.window);
  expect(windows).toHaveLength(1);
  expect(windows[0]?.launch).toContain(` host ${opened.id}`);
  expect(await mesa('sessions', 'view', opened.id, 'structured')).toMatchObject({
    code: 0,
    stdout: `${opened.id} is in structured view\n`,
  });
});

test('sessions view refuses an unknown view', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  expect(await mesa('sessions', 'view', opened.id, 'sideways')).toMatchObject({
    code: 2,
    stderr: 'view must be structured or terminal\n',
  });
});
