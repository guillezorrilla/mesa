import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../../mesa.js';
import {
  fakeTmux,
  newSession,
  profilePaths,
  scriptedRunner,
  tempDir,
  testDeps,
  testStore,
} from '../../testing/index.js';

const ATTACH = [
  'tmux',
  '-u',
  '-L',
  'mesa-default',
  '-f',
  '/dev/null',
  // Its own view of the project's session (ids from sequentialIds), so other terminals keep theirs.
  'new-session',
  '-t',
  '=lantern-cove',
  '-s',
  expect.stringMatching(/^_view-[0-9a-z]{8}$/),
  ';',
  'select-window',
  '-t',
  expect.stringMatching(/^=_view-[0-9a-z]{8}:=claude-aaaaaa$/),
  ';',
  'set-option',
  'destroy-unattached',
  'on',
];

/** A profile holding one session record, its window open in a fake tmux; binaries in `failing` exit 1. */
function setUp(
  failing: string[] = [],
  env = {},
  outputs: Parameters<typeof scriptedRunner>[0] = {},
) {
  const home = tempDir();
  const tmux = fakeTmux();
  const scripted = scriptedRunner({ tmux: tmux.answer, ...outputs }, { failing });
  const mesa = createMesa('default', testDeps(home, { run: scripted.run, env }));
  mesa.init({ vault: 'vault' });
  const store = testStore(home);
  const { id } = store.create(() => newSession());
  tmux.addWindow({ project: 'lantern-cove', window: 'claude-aaaaaa' });
  return { home, mesa, id, calls: scripted.calls, tmux };
}

test('without --app, attach hands back the attach argv for this terminal', async () => {
  const { mesa, id } = setUp();
  expect(await mesa.sessions.attach(id)).toEqual({
    attached: { opened: true, target: 'lantern-cove:claude-aaaaaa', app: null },
    exec: ATTACH,
  });
});

test('natural selection disables tmux mouse only in the newly attached view', async () => {
  const { mesa, id } = setUp();
  mesa.config.set('terminal.naturalSelection', 'true');
  const argv = (await mesa.sessions.attach(id)).exec ?? [];
  const view = argv[argv.indexOf('-s') + 1];
  expect(argv.join(' ')).toContain(
    `; set-option -t =${view}: mouse off ; set-option destroy-unattached on`,
  );
});

test('a session whose window is gone is not_found with the resume hint', async () => {
  const { mesa, id, tmux } = setUp();
  tmux.windows.length = 0;
  await expect(mesa.sessions.attach(id)).rejects.toMatchObject({
    code: 'not_found',
    message: 'session ended; use mesa resume',
  });
  await expect(mesa.sessions.attach('nope0000')).rejects.toMatchObject({ code: 'not_found' });
});

test('--app with any terminal.app (Terminal by default) opens a one-line script with open -a', async () => {
  const { mesa: plain, id: first } = setUp();
  expect((await plain.sessions.attach(first, true)).attached.app).toBe('Terminal');
  for (const app of ['Terminal', 'iTerm', 'Ghostty'] as const) {
    const { home, mesa, id, calls } = setUp([], { PATH: '/opt/homebrew/bin:/usr/bin' });
    mesa.config.set('terminal.app', app);
    const { attached, exec } = await mesa.sessions.attach(id, true);
    expect(attached.app).toBe(app);
    expect(exec).toBeUndefined();
    const script = join(profilePaths(home, 'default').attachScripts, `${id}.command`);
    expect(calls.at(-1)).toMatchObject({ file: 'open', args: ['-a', app, script] });
    // The app may start without Homebrew on PATH, so the script carries the caller's.
    expect(readFileSync(script, 'utf8')).toMatch(
      /^#!\/bin\/sh\nexport PATH='\/opt\/homebrew\/bin:\/usr\/bin'\nexec 'tmux' '-u' '-L' 'mesa-default' '-f' '\/dev\/null' 'new-session' '-t' '=lantern-cove' '-s' '_view-[0-9a-z]{8}' ';' 'select-window' '-t' '=_view-[0-9a-z]{8}:=claude-aaaaaa' ';' 'set-option' 'destroy-unattached' 'on'\n$/,
    );
    expect(statSync(script).mode & 0o777).toBe(0o700);
  }
});

test('a terminal app that fails to open is an error, not a silent no-op', async () => {
  const { mesa, id } = setUp(['open']);
  await expect(mesa.sessions.attach(id, true)).rejects.toMatchObject({
    code: 'internal',
    message: 'could not open Terminal: exit 1',
  });
});

test('WezTerm tab preference opens a tab in an existing window and falls back to a new window', async () => {
  const binary = '/Applications/WezTerm.app/Contents/MacOS/wezterm';
  const { mesa, id, calls, home } = setUp(
    [],
    {},
    {
      [binary]: (args) =>
        args[1] === 'list'
          ? '[{"window_id":3,"is_active":false},{"window_id":42,"is_active":true}]'
          : '123',
    },
  );
  mesa.config.set('terminal.app', 'WezTerm');
  mesa.config.set('terminal.wezTermNewTab', 'true');
  await mesa.sessions.attach(id, true);
  expect(calls.at(-1)).toMatchObject({
    file: binary,
    args: [
      'cli',
      'spawn',
      '--window-id',
      '42',
      '--',
      join(profilePaths(home, 'default').attachScripts, `${id}.command`),
    ],
  });
  expect(calls.some((call) => call.file === 'open')).toBe(false);

  const noWindow = setUp([], {}, { [binary]: '[]' });
  noWindow.mesa.config.set('terminal.app', 'WezTerm');
  noWindow.mesa.config.set('terminal.wezTermNewTab', 'true');
  await noWindow.mesa.sessions.attach(noWindow.id, true);
  expect(noWindow.calls.at(-1)?.file).toBe('open');
});
