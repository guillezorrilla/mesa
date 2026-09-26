import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { newSession, scriptedRunner, tempDir, testDeps, testStore } from '../testing/index.js';

const ATTACH = [
  'tmux',
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
  'set-option',
  'destroy-unattached',
  'on',
  ';',
  'select-window',
  '-t',
  expect.stringMatching(/^=_view-[0-9a-z]{8}:=claude-aaaaaa$/),
];

/** A profile holding one session record; binaries in `failing` (tmux: no window) exit 1. */
function setUp(failing: string[] = [], env = {}) {
  const home = tempDir();
  const scripted = scriptedRunner({}, { failing });
  const mesa = createMesa('default', testDeps(home, { run: scripted.run, env }));
  mesa.init({ vault: 'vault' });
  const store = testStore(home);
  const { id } = store.create(() => newSession());
  return { home, mesa, id, calls: scripted.calls };
}

test('without --app, attach hands back the attach argv for this terminal', async () => {
  const { mesa, id, calls } = setUp();
  expect(await mesa.sessions.attach(id)).toEqual({
    attached: { opened: true, target: 'lantern-cove:claude-aaaaaa', app: null },
    exec: ATTACH,
  });
  // Liveness is the exact window on the profile socket.
  expect(calls[0]?.args).toEqual([
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'list-panes',
    '-t',
    '=lantern-cove:=claude-aaaaaa',
    '-F',
    '#{pane_id}',
  ]);
});

test('a session whose window is gone is not_found with the resume hint', async () => {
  const { mesa, id } = setUp(['tmux']);
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
    const script = join(home, `.mesa/default/attach/${id}.command`);
    expect(calls.at(-1)).toMatchObject({ file: 'open', args: ['-a', app, script] });
    // The app may start without Homebrew on PATH, so the script carries the caller's.
    expect(readFileSync(script, 'utf8')).toMatch(
      /^#!\/bin\/sh\nexport PATH='\/opt\/homebrew\/bin:\/usr\/bin'\nexec 'tmux' '-L' 'mesa-default' '-f' '\/dev\/null' 'new-session' '-t' '=lantern-cove' '-s' '_view-[0-9a-z]{8}' ';' 'set-option' 'destroy-unattached' 'on' ';' 'select-window' '-t' '=_view-[0-9a-z]{8}:=claude-aaaaaa'\n$/,
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
