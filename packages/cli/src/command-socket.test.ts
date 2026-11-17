import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { profilePaths, shortTempDir } from '@mesa/core/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runCli } from './cli.js';
import { type Forwarded, forwardCall } from './command-socket.js';
import { cliDeps } from './testing.js';
import { VERSION } from './version.js';

const uid = process.getuid?.() ?? -1;
let home = '';
let socket = '';
let stopServer = () => {};

beforeEach(async () => {
  home = shortTempDir();
  socket = profilePaths(home, 'default').commandSocket;
  await runCli(['init', '--vault', 'vault'], cliDeps(home));
});
afterEach(() => {
  stopServer();
  rmSync(home, { recursive: true, force: true });
});

/** `mesa serve` over this home, listening on its socket until the test ends. */
async function startServer() {
  const out = await runCli(['serve'], cliDeps(home));
  let end = () => {};
  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });
  // No stdio requests: its stdin ends when the test does.
  const lines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({ next: () => ended.then(() => ({ done: true, value: '' })) }),
  };
  const logged: string[] = [];
  void out.serve?.({ lines, write: () => {}, log: (t) => logged.push(t) });
  stopServer = () => end();
  // Answering, not only there: a stale socket is there before the server replaces it.
  await vi.waitFor(async () =>
    expect(await forwardCall(socket, uid, call(['--version']), async () => '')).toBeDefined(),
  );
  expect(logged).toEqual([]);
}

const call = (argv: string[], over: Partial<Forwarded> = {}): Forwarded => ({
  version: VERSION,
  argv,
  cwd: home,
  env: {},
  startedAt: Date.now(),
  ...over,
});

const inProcess = (argv: string[]) => runCli(argv, cliDeps(home));

test('a forwarded read and save give the envelope and exit code they give in process', async () => {
  await startServer();
  for (const argv of [
    ['--json', 'vault', 'search', 'Index'],
    ['--json', 'nope'],
    ['awake', 'on'],
    ['--json', 'awake', 'off'],
  ]) {
    const forwarded = await forwardCall(socket, uid, call(argv), async () => '');
    const here = await inProcess(argv);
    expect(forwarded).toEqual({ code: here.code, stdout: here.stdout, stderr: here.stderr });
  }
  // The save landed: the in-process read after it sees it.
  expect(JSON.parse((await inProcess(['--json', 'awake'])).stdout).data.mode).toBe('off');
  // Plain text, an error's message on stderr.
  expect(await forwardCall(socket, uid, call(['nope']), async () => '')).toMatchObject({
    code: 2,
    stdout: '',
    stderr: expect.stringContaining('Unknown command: nope'),
  });
});

test("a hook runs with its caller's session id, stdin and start, and its stdout comes back", async () => {
  await startServer();
  const read = vi.fn(async () => JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop' }));
  const reply = await forwardCall(
    socket,
    uid,
    call(['--json', 'hook', 'claude'], {
      env: { MESA_SESSION_ID: 'aaaaaaaa' },
      startedAt: Date.parse('2026-11-10T09:00:00.000Z'),
    }),
    read,
  );
  expect(reply).toMatchObject({ code: 0 });
  expect(JSON.parse((reply as { stdout: string }).stdout).data).toEqual({
    recorded: true,
    event: 'Stop',
  });
  expect(read).toHaveBeenCalledOnce();
  const log = readFileSync(join(profilePaths(home, 'default').events, 'aaaaaaaa.jsonl'), 'utf8');
  expect(JSON.parse(log)).toMatchObject({ at: '2026-11-10T09:00:00.000Z', event: 'Stop' });
  // A command that never reads stdin leaves it unread, as in process.
  const quiet = vi.fn(async () => '');
  await forwardCall(socket, uid, call(['--json', 'awake']), quiet);
  expect(quiet).not.toHaveBeenCalled();
});

test('the caller runs it itself with no server, a stale socket, an open folder or another version', async () => {
  const read = async () => '';
  expect(await forwardCall(socket, uid, call(['--version']), read)).toBeUndefined();
  // A socket a killed server left behind.
  mkdirSync(join(socket, '..'), { recursive: true, mode: 0o700 });
  spawnSync(process.execPath, [
    '-e',
    `require('node:net').createServer().listen(${JSON.stringify(socket)}, () => process.kill(process.pid, 'SIGKILL'))`,
  ]);
  expect(existsSync(socket)).toBe(true);
  expect(await forwardCall(socket, uid, call(['--version']), read)).toBeUndefined();
  // The stale socket is replaced by the next server.
  await startServer();
  expect(await forwardCall(socket, uid, call(['--version']), read)).toMatchObject({ code: 0 });
  // Another Mesa version runs it itself: the server ran nothing.
  const skewed = call(['awake', 'on'], { version: `${VERSION}-other` });
  expect(await forwardCall(socket, uid, skewed, read)).toBeUndefined();
  expect(JSON.parse((await inProcess(['--json', 'awake'])).stdout).data.mode).not.toBe('on');
  // A folder another user owns, or others can enter, may hold anyone's socket.
  expect(await forwardCall(socket, uid + 1, call(['--version']), read)).toBeUndefined();
  chmodSync(join(socket, '..'), 0o755);
  expect(await forwardCall(socket, uid, call(['--version']), read)).toBeUndefined();
});

test('a command that serves is handed back to its caller before it runs', async () => {
  await startServer();
  for (const argv of [['serve'], ['phone', 'serve'], ['vault', 'mcp'], ['host', 'a1b2c3d4']])
    expect(await forwardCall(socket, uid, call(argv), async () => '')).toBeUndefined();
});

test('a second mesa serve leaves the live socket to the first', async () => {
  await startServer();
  const second = await runCli(['serve'], cliDeps(home));
  const logged: string[] = [];
  await second.serve?.({
    lines: (async function* () {})(),
    write: () => {},
    log: (t) => logged.push(t),
  });
  expect(logged).toEqual(['mesa serve: no Command socket: another mesa serve answers on it\n']);
  expect(await forwardCall(socket, uid, call(['--version']), async () => '')).toMatchObject({
    code: 0,
  });
});
