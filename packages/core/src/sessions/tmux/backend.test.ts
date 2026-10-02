import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, describe, expect, test } from 'vitest';
import { AGENTS } from '../../agents/agents.js';
import { vaultServer } from '../../agents/vault-mount.js';
import { execRunner, type Runner, shellWord } from '../../lib/process.js';
import {
  CLAUDE_MOUNT,
  NATIVE_LAUNCH,
  scriptedRunner,
  tempDir,
  tmuxLine,
} from '../../testing/index.js';
import { outputLog, outputTail } from '../output-log.js';
import { tmuxBackend } from './backend.js';
import { exact, type WindowTarget } from './format.js';

const socket = `mesa-test-${process.pid}`;
const hasTmux = (await execRunner('tmux', ['-V'], 2000)).ok;

/** Raw tmux on the test socket, for what the backend does not expose. */
const raw = async (...args: string[]) => {
  const res = await execRunner('tmux', ['-L', socket, ...args], 2000);
  return res.ok ? res.stdout.trim() : `failed: ${res.detail}`;
};

// The server starts under a Claude Code parent's variables, which the backend must keep away
// from its windows. `env` sets them for the tmux process, as a real parent would.
const PARENT = {
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'parent',
  CLAUDE_PID: '42',
  NO_COLOR: '1',
};
const underParent: Runner = (file, args, timeoutMs) =>
  execRunner(
    'env',
    [...Object.entries(PARENT).map(([k, v]) => `${k}=${v}`), file, ...args],
    timeoutMs,
  );

/** Reads until `want` matches, for output a pane has not drawn yet. */
async function eventually(read: () => Promise<string>, want: RegExp) {
  for (let i = 0; i < 40 && !want.test(await read()); i++) await sleep(50);
  return read();
}

// Vitest hides console output from passing tests, so the reason goes straight to stderr.
if (!hasTmux)
  process.stderr.write(
    'tmux is not on PATH: skipping the tmux backend tests (brew install tmux)\n',
  );

describe.skipIf(!hasTmux)(`tmux backend on socket ${socket}`, () => {
  const tmux = tmuxBackend({ sleep: async () => {}, run: underParent, socket, env: PARENT });
  const cwd = tempDir();
  const open = (target: WindowTarget, command: string, env = {}) =>
    tmux.openWindow({ ...target, cwd, command, env });
  const lantern = (window: string) => ({ project: 'lantern', window });

  afterAll(async () => {
    const path = await raw('display-message', '-p', '#{socket_path}');
    await raw('kill-server');
    // kill-server leaves the socket file behind.
    if (!path.startsWith('failed')) rmSync(path, { force: true });
  });

  test("openWindow creates the project's tmux session, then adds windows to it, with Mesa options", async () => {
    const first = lantern('claude-aaaaaa');
    const probe =
      'echo "cc=[$CLAUDECODE] color=[$NO_COLOR] id=$MESA_SESSION_ID term=$TERM"; exec cat';
    expect(await open(first, `sh -c '${probe}'`, { MESA_SESSION_ID: 'm1' })).toEqual(first);
    expect(await eventually(() => tmux.capturePane(first, 5), /id=m1/)).toBe(
      'cc=[] color=[1] id=m1 term=tmux-256color',
    );
    expect(
      await raw('display-message', '-p', '-t', 'lantern:0', '#{remain-on-exit} #{history_limit}'),
    ).toBe('on 10000');
    // The window has its id; the tmux session, which later windows inherit from, does not.
    expect(await raw('show-environment', '-t', 'lantern')).not.toContain('MESA_SESSION_ID');

    await open(lantern('claude-bbbbbb'), 'cat');
    // A project whose name starts with another's: exact targets keep the two apart.
    await open({ project: 'lantern-cove', window: 'claude-cccccc' }, 'cat');

    const rows = await tmux.listWindows('lantern');
    expect(rows.map((w) => [w.project, w.index, w.window, w.command, w.path, w.dead])).toEqual([
      ['lantern', 0, 'claude-aaaaaa', 'cat', cwd, false],
      ['lantern', 1, 'claude-bbbbbb', 'cat', cwd, false],
    ]);
    expect(rows[0]?.panePid).toBeGreaterThan(0);
    expect(Date.parse(rows[0]?.activity ?? '')).toBeGreaterThan(Date.parse('2026-01-01'));
    expect((await tmux.listWindows()).map((w) => w.window)).toEqual([
      'claude-aaaaaa',
      'claude-bbbbbb',
      'claude-cccccc',
    ]);
    expect(await tmux.windowExists(first)).toBe(true);
    expect(await tmux.windowExists({ project: 'lantern-c', window: 'claude-cccccc' })).toBe(false);
    expect(await tmux.windowExists(lantern('claude-cccccc'))).toBe(false);
  });

  test('sendText types the text then Enter into a live agent', async () => {
    const target = lantern('claude-send01');
    await open(target, 'unset NO_COLOR; exec cat');
    expect(
      await eventually(
        () => raw('display-message', '-p', '-t', exact(target), '#{pane_current_command}'),
        /cat/,
      ),
    ).toBe('cat');
    await tmux.sendText(target, '-n hello');
    // cat echoes the typed line, then prints it back after Enter.
    expect(await eventually(() => tmux.capturePane(target, 5), /hello\n-n hello/)).toBe(
      '-n hello\n-n hello',
    );
  });

  test('sendText types a closing ; as it is, and a closing \\; too', async () => {
    const target = lantern('claude-semi01');
    await open(target, 'cat');
    await tmux.sendText(target, 'plain;');
    await tmux.sendText(target, 'one\\;');
    // cat echoes each typed line, then prints it back after Enter.
    expect(await eventually(() => tmux.capturePane(target, 8), /one\\;\none\\;/)).toBe(
      'plain;\nplain;\none\\;\none\\;',
    );
  });

  test('sendText refuses a shell unless forced, and an exited pane always', async () => {
    const shell = lantern('claude-shell1');
    await open(shell, 'sh');
    await eventually(
      () => raw('display-message', '-p', '-t', 'lantern:claude-shell1', '#{pane_current_command}'),
      /sh$/,
    );
    await expect(tmux.sendText(shell, 'echo typed')).rejects.toMatchObject({
      code: 'agent_unavailable',
      // macOS runs sh as bash.
      message: expect.stringMatching(
        /^no agent in lantern:claude-shell1: it runs (sh|bash); force/,
      ),
    });
    await tmux.sendText(shell, 'echo forced', { force: true });
    expect(await eventually(() => tmux.capturePane(shell, 5), /^forced$/m)).toMatch(/^forced$/m);

    const exited = lantern('claude-exit01');
    await open(exited, 'true');
    await eventually(
      async () =>
        String((await tmux.listWindows('lantern')).find((w) => w.window === exited.window)?.dead),
      /true/,
    );
    await expect(tmux.sendText(exited, 'x', { force: true })).rejects.toMatchObject({
      code: 'agent_unavailable',
      message: 'no agent in lantern:claude-exit01: its process exited',
    });
  });

  test("openWindow with a log pipes the pane's output to it from the first byte; outputTail reads it as plain text", async () => {
    // A folder the shell and tmux's formats would both misread, were its name not quoted for each.
    const logs = join(cwd, "it's #S logs");
    mkdirSync(logs);
    const target = lantern('claude-log00001');
    const file = outputLog(logs, 'log00001');
    const script = 'printf "\\033[31mred\\033[0m one\\ntwo\\n"; exec cat';
    await tmux.openWindow({ ...target, cwd, command: `sh -c '${script}'`, env: {}, log: file });
    const logged = () => Promise.resolve(existsSync(file) ? readFileSync(file, 'utf8') : '');
    // The raw stream, colours and the terminal's carriage returns kept, from its very first byte.
    expect(await eventually(logged, /two/)).toBe('\x1b[31mred\x1b[0m one\r\ntwo\r\n');
    await tmux.sendText(target, 'typed');
    // The terminal echoes the typed line, then cat prints it back.
    await eventually(logged, /typed\r\ntyped/);
    expect(outputTail(logs, 'log00001')).toEqual(['red one', 'two', 'typed', 'typed']);
    expect(outputTail(logs, 'log00001', 2)).toEqual(['typed', 'typed']);
    expect(await raw('display-message', '-p', '-t', exact(target), '#{pane_pipe}')).toBe('1');
  });

  test('openWindow without a log pipes nothing', async () => {
    const target = lantern('claude-log00002');
    await open(target, 'cat');
    expect(await raw('display-message', '-p', '-t', exact(target), '#{pane_pipe}')).toBe('0');
  });

  test('capturePane returns the last lines, trailing blank lines dropped', async () => {
    const target = lantern('claude-tail01');
    await open(target, `sh -c 'printf "one\\ntwo\\nthree\\n"; exec cat'`);
    expect(await eventually(() => tmux.capturePane(target, 2), /three/)).toBe('two\nthree');
  });

  test('a goal reaches the agent byte for byte: $HOME, backticks, both quotes, a newline', async () => {
    // A default-shell that runs nothing: the window must go through /bin/sh, not the user's shell.
    await tmux.ensureServer();
    await raw('set-option', '-g', 'default-shell', '/usr/bin/false');
    expect(await raw('show-options', '-gv', 'default-shell')).toBe('/usr/bin/false');
    const goal = `Say "hi" to $HOME and \`whoami\`, it's done\nthen stop`;
    const out = join(cwd, 'goal.out');
    // The command open runs, with printf standing in for claude.
    const command = AGENTS.claude
      .start('uuid', vaultServer(['/usr/local/bin/mesa']), NATIVE_LAUNCH, goal)
      .replace(`claude --session-id uuid ${CLAUDE_MOUNT}`, 'printf %s');
    await open(lantern('claude-goal01'), `${command} > ${out}`);
    const written = () => Promise.resolve(existsSync(out) ? readFileSync(out, 'utf8') : '');
    expect(await eventually(written, /stop$/)).toBe(goal);
  });

  test('ensureServer sets one pane-died hook; a pane that dies runs mesa hook tmux with its window', async () => {
    const out = join(cwd, 'died.log');
    // In a folder whose name tmux would read as a format, were its # not doubled.
    const folder = join(cwd, 'at #S here');
    mkdirSync(folder);
    const script = join(folder, 'mesa-stand-in.sh');
    // Stands in for mesa: it writes the arguments the hook passes, and prints, as mesa does.
    writeFileSync(script, `printf '%s|' "$@" >> '${out}'; echo >> '${out}'; echo printed\n`);
    const hooked = tmuxBackend({
      sleep: async () => {},
      run: underParent,
      socket,
      env: PARENT,
      mesa: { self: ['/bin/sh', script], profile: 'ptest' },
    });
    await hooked.ensureServer();
    await hooked.ensureServer();
    const hooks = (await raw('show-hooks', '-g', 'pane-died')).split('\n').filter(Boolean);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toContain('hook tmux pane-died -- #{q:session_name} #{q:window_name}');
    // Read back exactly as tmux prints it, so a hook for a mesa that moved would not count.
    expect(await hooked.paneDiedHookState()).toEqual({ server: true, paneDied: true });
    const other = tmuxBackend({
      sleep: async () => {},
      run: underParent,
      socket,
      env: PARENT,
      mesa: { self: ['/moved/mesa'], profile: 'ptest' },
    });
    expect(await other.paneDiedHookState()).toEqual({ server: true, paneDied: false });

    const started = Date.now();
    await hooked.openWindow({
      ...lantern('claude-died01'),
      cwd,
      command: "sh -c 'exit 0'",
      env: {},
    });
    // A name no Mesa window has, but a hand-made one might: it reaches the shell as one word.
    const pwned = join(cwd, 'pwned');
    const hostile = `w'$(touch ${pwned})'`;
    await hooked.openWindow({ ...lantern(hostile), cwd, command: "sh -c 'exit 0'", env: {} });
    const logged = () => Promise.resolve(existsSync(out) ? readFileSync(out, 'utf8') : '');
    const lines = (await eventually(logged, /pwned/)).split('\n').filter(Boolean).sort();
    expect(lines).toEqual([
      '--profile|ptest|hook|tmux|pane-died|--|lantern|claude-died01|',
      `--profile|ptest|hook|tmux|pane-died|--|lantern|${hostile}|`,
    ]);
    expect(existsSync(pwned)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    // What the hook printed shows nowhere: no pane was put in view mode to show it.
    await sleep(200);
    expect(new Set((await raw('list-panes', '-a', '-F', '#{pane_in_mode}')).split('\n'))).toEqual(
      new Set(['0']),
    );
    await raw('set-hook', '-gu', 'pane-died');
  });

  test('runMesaLater runs this mesa from the server, in the background, after its delay', async () => {
    const out = join(cwd, 'later.log');
    const folder = join(cwd, 'later #S here');
    mkdirSync(folder);
    const script = join(folder, 'mesa-stand-in.sh');
    writeFileSync(script, `printf '%s|' "$@" >> '${out}'; echo >> '${out}'; echo printed\n`);
    const later = tmuxBackend({
      sleep: async () => {},
      run: underParent,
      socket,
      env: PARENT,
      mesa: { self: ['/bin/sh', script], profile: 'ptest' },
    });
    await later.ensureServer();
    const started = Date.now();
    await later.runMesaLater(['stop', 'a1b2c3d4', "it's #1 $HOME"], 1);
    // It returns at once: the server runs the command, not this mesa.
    expect(Date.now() - started).toBeLessThan(500);
    const logged = () => Promise.resolve(existsSync(out) ? readFileSync(out, 'utf8') : '');
    // The stand-in writes its line in two steps: wait for the newline that ends it.
    expect(await eventually(logged, /stop.*\n/)).toBe(
      "--profile|ptest|stop|a1b2c3d4|it's #1 $HOME|\n",
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    await raw('set-hook', '-gu', 'pane-died');
  });

  test('openView lays windows out side by side, a terminal on each; a layout tmux lacks is usage', async () => {
    const [a, b] = [lantern('claude-view01'), lantern('claude-view02')];
    await open(a, 'cat');
    await open(b, 'cat');
    let n = 0;
    const ids = () => `v${++n}`;
    const view = await tmux.openView([a, b], 'even-vertical', 'lantern', ids);
    expect(view).toEqual({ project: '_view-v1', window: 'lantern' });
    // even-vertical: the two panes stack, one above the other.
    const panes = (
      await raw('list-panes', '-t', '=_view-v1:=lantern', '-F', '#{pane_left} #{pane_top}')
    )
      .split('\n')
      .map((l) => l.split(' '));
    expect(panes.map(([left]) => left)).toEqual(['0', '0']);
    expect(new Set(panes.map(([, top]) => top)).size).toBe(2);
    // Each pane is a terminal on its own window through a single-window view.
    const current = (session: string) =>
      raw('display-message', '-p', '-t', `=${session}:`, '#{window_name}');
    expect(await eventually(() => current('_view-v2'), /claude-view01/)).toBe('claude-view01');
    expect(await eventually(() => current('_view-v3'), /claude-view02/)).toBe('claude-view02');
    // Views stay out of the listings.
    expect((await tmux.listWindows()).some((w) => w.project.startsWith('_view-'))).toBe(false);
    expect(tmux.viewAttachArgv(view)).toEqual([
      'tmux',
      '-L',
      socket,
      '-f',
      '/dev/null',
      'attach-session',
      '-t',
      '=_view-v1',
      ';',
      'set-option',
      'destroy-unattached',
      'on',
    ]);
    await tmux.killWindow(a);
    const clients = () => raw('list-clients', '-F', '#{session_name}');
    expect(await eventually(clients, /^_view-v3$/)).toBe('_view-v3');
    expect(await raw('list-panes', '-t', '=_view-v1:=lantern', '-F', '#{pane_dead}')).toBe('1\n0');
    expect(await current('_view-v3')).toBe(b.window);
    expect(await raw('has-session', '-t', '=_view-v2')).toMatch(/^failed/);
    // The surviving pane still sends only to its own agent.
    await raw('send-keys', '-t', '=_view-v1:=lantern.1', '-l', 'still-b');
    await raw('send-keys', '-t', '=_view-v1:=lantern.1', 'Enter');
    expect(await eventually(() => tmux.capturePane(b, 5), /still-b/)).toContain('still-b');
    await raw('kill-session', '-t', '=_view-v1');

    await expect(tmux.openView([b], 'sideways', 'lantern', ids)).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringMatching(/^tmux cannot lay out a view as sideways: /),
    });
    expect(await raw('has-session', '-t', '=_view-v4')).toMatch(/^failed/);
  });

  test('a view whose source window vanished before linking ends its client', async () => {
    let n = 0;
    const view = await tmux.openView([lantern('gone')], 'tiled', 'missing', () => `missing${++n}`);
    try {
      expect(
        await eventually(() => raw('list-panes', '-t', exact(view), '-F', '#{pane_dead}'), /^1$/),
      ).toBe('1');
      expect(await raw('has-session', '-t', '=_view-missing2')).toMatch(/^failed/);
    } finally {
      await tmux.closeView(view);
    }
  });

  test('killWindow removes a window; a missing window or project is not_found or empty', async () => {
    const target = lantern('claude-kill01');
    await open(target, 'cat');
    await tmux.killWindow(target);
    expect(await tmux.windowExists(target)).toBe(false);
    await expect(tmux.killWindow(target)).rejects.toMatchObject({ code: 'not_found' });
    await expect(tmux.capturePane(target, 5)).rejects.toMatchObject({ code: 'not_found' });
    expect(await tmux.listWindows('no-such-project')).toEqual([]);
  });

  test('a server whose last window is gone lists nothing and has no windows', async () => {
    // exit-empty off keeps the server up; tmux then answers `no current target` to everything.
    for (const w of await tmux.listWindows()) await tmux.killWindow(w);
    expect(await raw('list-sessions')).toMatch(/no current target|^$/);
    expect(await tmux.listWindows()).toEqual([]);
    expect(await tmux.listWindows('lantern')).toEqual([]);
    expect(await tmux.windowExists(lantern('claude-aaaaaa'))).toBe(false);
  });
});

test('every call goes to the profile socket without the user tmux.conf', async () => {
  const { run, calls } = scriptedRunner({
    tmux: `${tmuxLine({ project: 'lantern', window: 'claude-aaaaaa' })}\n`,
  });
  const tmux = tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-work', env: {} });
  expect(await tmux.listWindows()).toEqual([
    {
      project: 'lantern',
      index: 0,
      window: 'claude-aaaaaa',
      panePid: 4242,
      command: '2.1.282',
      path: '/src/lantern',
      activity: '2026-09-25T17:59:38.000Z',
      dead: false,
    },
  ]);
  expect(calls[0]?.args.slice(0, 6)).toEqual([
    '-L',
    'mesa-work',
    '-f',
    '/dev/null',
    'list-windows',
    '-a',
  ]);
});

test('openWindow changes directory before starting sh for both new and existing projects', async () => {
  for (const exists of [false, true]) {
    const { run, calls } = scriptedRunner({
      tmux: (args) =>
        args.includes('has-session') && !exists
          ? { ok: false, reason: 'failed', detail: 'no session' }
          : { ok: true, stdout: '' },
    });
    const tmux = tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-work', env: {} });
    await tmux.openWindow({
      project: 'lantern',
      window: 'w',
      cwd: "/src/it's lantern",
      command: 'exec cat',
      env: {},
    });
    const args = calls.find((c) => c.args.includes(exists ? 'new-window' : 'new-session'))?.args;
    expect(args?.slice(args.indexOf('/usr/bin/env'))).toEqual([
      '/usr/bin/env',
      '-C',
      "/src/it's lantern",
      '/bin/sh',
      '-c',
      'exec cat',
    ]);
  }
});

test.skipIf(!hasTmux)(
  'openWindow starts in its folder after the server folder was deleted',
  async () => {
    const socket = `mesa-deleted-${process.pid}`;
    const origin = tempDir();
    const cwd = join(tempDir(), "it's lantern");
    mkdirSync(cwd);
    const raw = (args: string[]) =>
      execRunner('tmux', ['-L', socket, '-f', '/dev/null', ...args], 2000);
    const tmux = tmuxBackend({ sleep: async () => {}, run: execRunner, socket, env: {} });
    try {
      expect(
        (
          await execRunner(
            'tmux',
            ['-L', socket, '-f', '/dev/null', 'new-session', '-d', '-s', 'seed', 'cat'],
            2000,
            { cwd: origin },
          )
        ).ok,
      ).toBe(true);
      rmSync(origin, { recursive: true });
      for (const window of ['first', 'second']) {
        const target = { project: 'lantern', window };
        const out = join(cwd, `${window}.txt`);
        await tmux.openWindow({
          ...target,
          cwd,
          command: `printf '%s\\n' "$PWD" > ${shellWord(out)}; /bin/pwd >> ${shellWord(out)}; echo cwd-ok; exec cat`,
          env: {},
        });
        const output = await eventually(() => tmux.capturePane(target, 10), /cwd-ok/);
        expect(output).toBe('cwd-ok');
        expect(readFileSync(out, 'utf8')).toBe(`${cwd}\n${cwd}\n`);
        expect((await tmux.findWindow(target))?.dead).toBe(false);
      }
    } finally {
      const path = await raw(['display-message', '-p', '#{socket_path}']);
      await raw(['kill-server']);
      if (path.ok) rmSync(path.stdout.trim(), { force: true });
    }
  },
);

test('a sandbox-denied tmux socket is an error, never an exited session', async () => {
  const { run } = scriptedRunner({
    tmux: () => ({
      ok: false,
      reason: 'failed',
      detail: 'error connecting to /private/tmp/tmux-501/mesa-probe (Operation not permitted)',
    }),
  });
  const tmux = tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-work', env: {} });
  await expect(
    tmux.findWindow({ project: 'lantern', window: 'claude-aaaaaa' }),
  ).rejects.toMatchObject({
    code: 'internal',
  });
});

test('the server drops nesting flags without clearing other environment', async () => {
  const { run, calls } = scriptedRunner();
  const env = { ...PARENT, CLAUDE_CONFIG_DIR: '/c', HOME: '/h' };
  await tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-work', env }).ensureServer();
  const args = calls[0]?.args ?? [];
  const unset = args.flatMap((a, i) => (a === '-gu' ? [args[i + 1]] : []));
  expect(unset).toEqual(['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID']);
  expect(args.join(' ')).toContain(
    '; set-option -g remain-on-exit on ; set-option -g history-limit 10000',
  );
});

test('the server takes the app terminal options: mouse, no status, OSC 52, drag copies to pbcopy', async () => {
  const { run, calls } = scriptedRunner();
  await tmuxBackend({ sleep: async () => {}, run, socket: 'mesa-default', env: {} }).ensureServer();
  const args = calls[0]?.args.join(' ') ?? '';
  for (const option of ['-g mouse on', '-g status off', '-s set-clipboard external']) {
    expect(args).toContain(`set-option ${option}`);
  }
  for (const table of ['copy-mode', 'copy-mode-vi']) {
    expect(args).toContain(
      `bind-key -T ${table} MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel pbcopy`,
    );
  }
  expect(args).not.toContain('allow-passthrough');
});

test('a missing or hung tmux is tmux_unavailable', async () => {
  const missing = tmuxBackend({
    sleep: async () => {},
    run: scriptedRunner({}, { missing: ['tmux'] }).run,
    socket: 's',
    env: {},
  });
  const target = { project: 'p', window: 'w' };
  for (const call of [
    () => missing.openWindow({ ...target, cwd: '/', command: 'cat', env: {} }),
    () => missing.listWindows(),
    () => missing.windowExists(target),
    () => missing.sendText(target, 'x'),
  ]) {
    await expect(call()).rejects.toMatchObject({
      code: 'tmux_unavailable',
      message: 'tmux not found on PATH; install with `brew install tmux`',
    });
  }
  const slow = tmuxBackend({
    sleep: async () => {},
    run: scriptedRunner({}, { slow: ['tmux'] }).run,
    socket: 's',
    env: {},
  });
  await expect(slow.listWindows()).rejects.toMatchObject({ code: 'tmux_unavailable' });
});
