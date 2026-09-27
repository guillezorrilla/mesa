import {
  CLAUDE_VERSION,
  newSession,
  scriptedRunner,
  shortIds,
  testStore,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('attach: here it hands back the attach argv, --app opens terminal.app, gone is exit 3', async () => {
  await mesa('init', '--vault', 'vault');
  testStore(cli.home, 'default', shortIds('aaaaaaaa')).create(() => newSession());
  const here = await mesa('attach', 'aaaaaaaa', '--json');
  expect(here.json.data).toEqual({ opened: true, target: 'lantern-cove:claude-aaaaaa', app: null });
  expect(here.exec?.slice(-2)).toEqual([
    '-t',
    expect.stringMatching(/^=_view-[0-9a-z]{8}:=claude-aaaaaa$/),
  ]);

  // --print: the argv the app's terminal runs, no terminal needed, nothing attached.
  cli.tty = false;
  const printed = await mesa('attach', 'aaaaaaaa', '--print', '--json');
  // Every terminal gets a fresh view session: the same command, its own view id.
  expect(printed.json.data.target).toBe('lantern-cove:claude-aaaaaa');
  expect(printed.json.data.argv.slice(0, 8)).toEqual(here.exec?.slice(0, 8));
  expect(printed.json.data.argv[9]).not.toBe(here.exec?.[9]);
  expect(printed.exec).toBeUndefined();
  cli.tty = true;
  // resize: the window takes the view's size, then the size goes back to tmux's own policy.
  const { run: sized, calls } = scriptedRunner({ tmux: '' });
  cli.run = sized;
  expect((await mesa('resize', 'aaaaaaaa', '120', '40', '--json')).json.data).toEqual({
    session: 'aaaaaaaa',
    target: 'lantern-cove:claude-aaaaaa',
    cols: 120,
    rows: 40,
  });
  expect(calls.at(-1)?.args.slice(4)).toEqual([
    'resize-window',
    '-t',
    '=lantern-cove:=claude-aaaaaa',
    '-x',
    '120',
    '-y',
    '40',
    ';',
    'set-option',
    '-w',
    '-t',
    '=lantern-cove:=claude-aaaaaa',
    '-u',
    'window-size',
  ]);
  // Core checks the range; the CLI checks it is a whole number.
  expect(await mesa('resize', 'aaaaaaaa', '0', '40')).toMatchObject({
    code: 2,
    stderr: 'cols must be a whole number from 1 to 10000\n',
  });
  expect(await mesa('resize', 'aaaaaaaa', '120', '10001')).toMatchObject({
    code: 2,
    stderr: 'rows must be a whole number from 1 to 10000\n',
  });
  expect(await mesa('resize', 'aaaaaaaa', '12.5', '40')).toMatchObject({
    code: 2,
    stderr: 'cols must be a whole number, not 12.5\n',
  });
  expect(await mesa('resize', 'ext-4242', '120', '40')).toMatchObject({ code: 3 });
  cli.run = scriptedRunner({ tmux: 'tmux 3.7c', claude: CLAUDE_VERSION }).run;

  await mesa('config', 'set', 'terminal.app', 'WezTerm');
  const app = await mesa('attach', 'aaaaaaaa', '--app');
  expect(app).toMatchObject({ stdout: 'attaching to lantern-cove:claude-aaaaaa in WezTerm\n' });
  expect(app.exec).toBeUndefined();
  expect((await mesa('config', 'set', 'terminal.app', 'Hyper')).code).toBe(4);

  // Without a terminal only --app can attach; open --attach refuses before opening anything.
  cli.tty = false;
  expect(await mesa('attach', 'aaaaaaaa', '--json')).toMatchObject({ code: 2 });
  expect((await mesa('attach', 'aaaaaaaa', '--app')).code).toBe(0);
  expect(await mesa('open', 'lantern-cove', '--attach')).toMatchObject({
    code: 2,
    stderr: 'not a terminal: run this in one, or use mesa attach --app\n',
  });

  cli.tty = true;
  cli.run = scriptedRunner({}, { failing: ['tmux'] }).run;
  expect(await mesa('attach', 'aaaaaaaa')).toMatchObject({
    code: 3,
    stderr: 'session ended; use mesa resume\n',
  });
});
