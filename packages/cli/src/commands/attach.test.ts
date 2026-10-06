import { newSession, shortIds, testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('attach: here it hands back the attach argv, --app opens terminal.app, gone is exit 3', async () => {
  await mesa('init', '--vault', 'vault');
  testStore(cli.home, 'default', shortIds('aaaaaaaa')).create(() => newSession());
  const tmux = cli.withTmux();
  tmux.addWindow({ project: 'lantern-cove', window: 'claude-aaaaaa' });
  const here = await mesa('attach', 'aaaaaaaa', '--json');
  expect(here.json.data).toEqual({ opened: true, target: 'lantern-cove:claude-aaaaaa', app: null });
  const exec = here.exec ?? [];
  expect(exec[exec.indexOf('select-window') + 2]).toMatch(/^=_view-[0-9a-z]{8}:=claude-aaaaaa$/);

  // --print: the argv the app's terminal runs, no terminal needed, nothing attached.
  cli.tty = false;
  const printed = await mesa('attach', 'aaaaaaaa', '--print', '--json');
  // Every terminal gets a fresh view session: the same command, its own view id.
  expect(printed.json.data.target).toBe('lantern-cove:claude-aaaaaa');
  expect(printed.json.data.argv.slice(0, 9)).toEqual(here.exec?.slice(0, 9));
  expect(printed.json.data.argv[10]).not.toBe(here.exec?.[10]);
  expect(printed.exec).toBeUndefined();
  // Only the app's terminal scrolls one line per wheel report; one attached here keeps tmux's 5.
  expect(printed.json.data.argv.join(' ')).toContain('@mesa-wheel-lines 1');
  expect(here.exec?.join(' ')).not.toContain('@mesa-wheel-lines');
  cli.tty = true;
  // resize: the window takes the view's size, then the size goes back to tmux's own policy.
  expect((await mesa('resize', 'aaaaaaaa', '120', '40', '--json')).json.data).toEqual({
    session: 'aaaaaaaa',
    target: 'lantern-cove:claude-aaaaaa',
    cols: 120,
    rows: 40,
  });
  expect(tmux.windows[0]?.size).toEqual({ cols: 120, rows: 40, pinned: false });
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
  // Its window is gone.
  tmux.windows.length = 0;
  expect(await mesa('attach', 'aaaaaaaa')).toMatchObject({
    code: 3,
    stderr: 'session ended; use mesa resume\n',
  });
});
