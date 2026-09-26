import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, describe, expect, test } from 'vitest';
import { AGENTS } from '../agents.js';
import { execRunner, type Runner } from '../process.js';
import { scriptedRunner, tempDir } from '../testing.js';
import { tmuxBackend, type WindowTarget } from './tmux.js';

const socket = `mesa-test-${process.pid}`;
const hasTmux = (await execRunner('tmux', ['-V'], 2000)).ok;

/** Raw tmux on the test socket, for what the backend does not expose. */
const raw = async (...args: string[]) => {
  const res = await execRunner('tmux', ['-L', socket, ...args], 2000);
  return res.ok ? res.stdout.trim() : `failed: ${res.detail}`;
};

// The server starts under a Claude Code parent's variables, which the backend must keep away
// from its windows. `env` sets them for the tmux process, as a real parent would.
const PARENT = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'parent', CLAUDE_PID: '42' };
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
  const tmux = tmuxBackend({ run: underParent, socket, env: PARENT });
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
    const probe = 'echo "cc=[$CLAUDECODE] id=$MESA_SESSION_ID term=$TERM"; exec cat';
    expect(await open(first, `sh -c '${probe}'`, { MESA_SESSION_ID: 'm1' })).toEqual(first);
    expect(await eventually(() => tmux.capturePane(first, 5), /id=m1/)).toBe(
      'cc=[] id=m1 term=tmux-256color',
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
    await open(target, 'cat');
    await tmux.sendText(target, '-n hello');
    // cat echoes the typed line, then prints it back after Enter.
    expect(await eventually(() => tmux.capturePane(target, 5), /hello\n-n hello/)).toBe(
      '-n hello\n-n hello',
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

  test('capturePane returns the last lines, trailing blank lines dropped', async () => {
    const target = lantern('claude-tail01');
    await open(target, `sh -c 'printf "one\\ntwo\\nthree\\n"; exec cat'`);
    expect(await eventually(() => tmux.capturePane(target, 2), /three/)).toBe('two\nthree');
  });

  test('a goal reaches the agent byte for byte: $HOME, backticks, both quotes, a newline', async () => {
    // A default-shell that runs nothing: the window must go through /bin/sh, not the user's shell.
    await raw('set-option', '-g', 'default-shell', '/usr/bin/false');
    const goal = `Say "hi" to $HOME and \`whoami\`, it's done\nthen stop`;
    const out = join(cwd, 'goal.out');
    // The command open runs, with printf standing in for claude.
    const command = AGENTS.claude
      .start('uuid', goal)
      .replace('claude --session-id uuid', 'printf %s');
    await open(lantern('claude-goal01'), `${command} > ${out}`);
    const written = () => Promise.resolve(existsSync(out) ? readFileSync(out, 'utf8') : '');
    expect(await eventually(written, /stop$/)).toBe(goal);
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
    tmux: 'lantern\t0\tclaude-aaaaaa\t4242\t2.1.282\t/src/lantern\t1790359178\t0\n',
  });
  const tmux = tmuxBackend({ run, socket: 'mesa-work', env: {} });
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

test('the server drops only the variables that make claude think it is nested', async () => {
  const { run, calls } = scriptedRunner();
  const env = { ...PARENT, CLAUDE_CONFIG_DIR: '/c', HOME: '/h' };
  await tmuxBackend({ run, socket: 'mesa-work', env }).ensureServer();
  const args = calls[0]?.args ?? [];
  const unset = args.flatMap((a, i) => (a === '-gu' ? [args[i + 1]] : []));
  expect(unset).toEqual(['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID']);
  expect(args.join(' ')).toContain(
    '; set-option -g remain-on-exit on ; set-option -g history-limit 10000',
  );
});

test('the server takes the app terminal options: mouse, no status, OSC 52, drag copies to pbcopy', async () => {
  const { run, calls } = scriptedRunner();
  await tmuxBackend({ run, socket: 'mesa-default', env: {} }).ensureServer();
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
    run: scriptedRunner({}, { slow: ['tmux'] }).run,
    socket: 's',
    env: {},
  });
  await expect(slow.listWindows()).rejects.toMatchObject({ code: 'tmux_unavailable' });
});
