import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '@mesa/core';
import { profilePaths, shortTempDir } from '@mesa/core/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runCli } from './cli.js';
import {
  type Deadlines,
  type Forwarded,
  forwardCall,
  MAX_MESSAGE_BYTES,
} from './command-socket.js';
import { cliDeps, fakeCommandServer } from './testing.js';
import { BUILD, VERSION } from './version.js';

const uid = process.getuid?.() ?? -1;
let home = '';
let socket = '';
let events = '';
let stopServer = async () => {};
/** What each forwarded call's runner and spawner were built with (CliDeps.forEnv). */
let bound: { env: Env; cwd: string }[] = [];

beforeEach(async () => {
  home = shortTempDir();
  ({ commandSocket: socket, events } = profilePaths(home, 'default'));
  bound = [];
  await runCli(['init', '--vault', 'vault'], cliDeps(home));
});
afterEach(async () => {
  await stopServer();
  rmSync(home, { recursive: true, force: true });
});

/** `mesa serve` over this home, until the test ends or stops it; what it logged. */
async function startServer({ answering = true } = {}) {
  const deps = cliDeps(home);
  const out = await runCli(['serve'], {
    ...deps,
    forEnv: (env, cwd) => {
      bound.push({ env, cwd });
      return { run: deps.mesa.run, spawn: deps.mesa.spawn };
    },
  });
  let end = () => {};
  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });
  // No stdio requests: its stdin ends when the test stops it.
  const lines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({ next: () => ended.then(() => ({ done: true, value: '' })) }),
  };
  const logged: string[] = [];
  const served = out.serve?.({ lines, write: () => {}, log: (t) => logged.push(t) });
  stopServer = async () => {
    end();
    await served;
  };
  // Answering, not only there: a stale socket is there before the server replaces it.
  if (answering) await vi.waitFor(async () => expect(await forward(['--version'])).toBeDefined());
  else await vi.waitFor(() => expect(logged).not.toEqual([]));
  return logged;
}

const DEADLINES: Deadlines = { readyMs: 2000 };
const read0 = async () => '';

/** `argv` forwarded to the socket as a client in `home` would send it, over `over`. */
const forward = (
  argv: string[],
  over: Partial<Forwarded> = {},
  readStdin = read0,
  deadlines = DEADLINES,
  user = uid,
) =>
  forwardCall(
    socket,
    user,
    { version: VERSION, build: BUILD, argv, cwd: home, env: {}, startedAt: Date.now(), ...over },
    readStdin,
    deadlines,
  );

const inProcess = (argv: string[]) => runCli(argv, cliDeps(home));
const STOP = JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop' });
const eventLog = () => join(events, 'aaaaaaaa.jsonl');

test('a forwarded read and save give the envelope and exit code they give in process', async () => {
  await startServer();
  for (const argv of [
    ['--json', 'vault', 'search', 'Index'],
    ['--json', 'nope'],
    ['awake', 'on'],
    ['--json', 'awake', 'off'],
  ]) {
    const forwarded = await forward(argv);
    const here = await inProcess(argv);
    expect(forwarded).toEqual({ code: here.code, stdout: here.stdout, stderr: here.stderr });
  }
  // The save landed: the in-process read after it sees it.
  expect(JSON.parse((await inProcess(['--json', 'awake'])).stdout).data.mode).toBe('off');
  // Plain text, an error's message on stderr.
  expect(await forward(['nope'])).toMatchObject({
    code: 2,
    stdout: '',
    stderr: expect.stringContaining('Unknown command: nope'),
  });
});

test("a hook runs with its caller's session id, stdin and start, and its stdout comes back", async () => {
  await startServer();
  const read = vi.fn(async () => STOP);
  const reply = await forward(
    ['--json', 'hook', 'claude'],
    { env: { MESA_SESSION_ID: 'aaaaaaaa' }, startedAt: Date.parse('2026-11-10T09:00:00.000Z') },
    read,
  );
  expect(reply).toMatchObject({ code: 0 });
  expect(JSON.parse((reply as { stdout: string }).stdout).data).toEqual({
    recorded: true,
    event: 'Stop',
  });
  expect(read).toHaveBeenCalledOnce();
  expect(JSON.parse(readFileSync(eventLog(), 'utf8'))).toMatchObject({
    at: '2026-11-10T09:00:00.000Z',
    event: 'Stop',
  });
  // A command that never reads stdin leaves it unread, as in process.
  const quiet = vi.fn(async () => '');
  await forward(['--json', 'awake'], {}, quiet);
  expect(quiet).not.toHaveBeenCalled();
});

test("a forwarded call resolves paths against its caller's folder, and starts processes there", async () => {
  await startServer();
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  const env = { MESA_PROFILE: 'default', PATH: '/caller/bin' };
  const reply = await forward(['--json', 'register', 'lantern-cove', '--create'], {
    cwd: join(home, 'src'),
    env,
  });
  expect(JSON.parse((reply as { stdout: string }).stdout).data.path).toBe(
    join(home, 'src/lantern-cove'),
  );
  // Its runner and spawner were built in the caller's environment and folder.
  expect(bound.at(-1)).toEqual({ env, cwd: join(home, 'src') });
});

test('a hook whose stdin cannot be read fails loudly, and records nothing', async () => {
  await startServer();
  const reply = await forward(['hook', 'claude'], { env: { MESA_SESSION_ID: 'aaaaaaaa' } }, () =>
    Promise.reject(new Error('EIO')),
  );
  expect(reply).toMatchObject({ code: 1, stderr: 'mesa: could not read stdin: EIO\n' });
  expect(existsSync(eventLog())).toBe(false);
});

test('a call over the cap is handed back unrun, never reported as maybe run', async () => {
  await startServer();
  const huge = 'x'.repeat(MAX_MESSAGE_BYTES);
  expect(await forward(['--version'], { env: { HUGE: huge } })).toBeUndefined();
  const payload = JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop', pad: huge });
  const hook = await forward(
    ['hook', 'claude'],
    { env: { MESA_SESSION_ID: 'aaaaaaaa' } },
    async () => payload,
  );
  expect(hook).toBeUndefined();
  expect(existsSync(eventLog())).toBe(false);
});

test('the caller runs it itself with no server, a stale socket, a folder not its own, or another build', async () => {
  expect(await forward(['--version'])).toBeUndefined();
  // A socket a killed server left behind.
  mkdirSync(join(socket, '..'), { recursive: true, mode: 0o700 });
  spawnSync(process.execPath, [
    '-e',
    `require('node:net').createServer().listen(${JSON.stringify(socket)}, () => process.kill(process.pid, 'SIGKILL'))`,
  ]);
  expect(existsSync(socket)).toBe(true);
  expect(await forward(['--version'])).toBeUndefined();
  // The stale socket is replaced by the next server.
  await startServer();
  expect(await forward(['--version'])).toMatchObject({ code: 0 });
  // Another version or build hands it back: the server ran nothing.
  for (const other of [{ version: `${VERSION}-other` }, { build: `${BUILD}-other` }])
    expect(await forward(['awake', 'on'], other)).toBeUndefined();
  expect(JSON.parse((await inProcess(['--json', 'awake'])).stdout).data.mode).not.toBe('on');
  // A folder another user owns, or others can enter, may hold anyone's socket.
  expect(await forward(['--version'], {}, read0, DEADLINES, uid + 1)).toBeUndefined();
  chmodSync(join(socket, '..'), 0o755);
  expect(await forward(['--version'])).toBeUndefined();
});

test('a command that serves or waits is handed back to its caller before it runs', async () => {
  await startServer();
  for (const argv of [
    ['serve'],
    ['phone', 'serve'],
    ['vault', 'mcp'],
    ['host', 'a1b2c3d4'],
    ['wait', 'a1b2c3d4'],
    ['run', 'mesa-vault', 'lantern-cove'],
    ['check', 'lantern-cove'],
    ['sources', 'connect', 'atlassian'],
    ['vault', 'capture', 'a1b2c3d4'],
    ['import', 'https://example.test/browse/KEL-1', '--project', 'lantern-cove'],
    ['import', 'refresh', '--project', 'lantern-cove'],
  ])
    expect(await forward(argv), argv.join(' ')).toBeUndefined();
});

test('a server that never takes the call, or takes a hook and never answers, does not hang it', async () => {
  const fake = await fakeCommandServer(socket, (lines, client) => {
    // Takes the second connection's call, then says nothing more.
    if (fake.calls.length === 2 && lines.length === 1) client.write('{"ready":true}\n');
  });
  stopServer = fake.close;
  const { calls } = fake;
  const quick = { readyMs: 200, replyMs: 300 };
  const started = Date.now();
  expect(await forward(['hook', 'claude'], {}, read0, quick)).toBeUndefined();
  expect(await forward(['hook', 'claude'], {}, read0, quick)).toBe('lost');
  expect(Date.now() - started).toBeLessThan(2000);
  // The first was never told to go, so it never ran there; the second was.
  expect(calls.map((lines) => lines.slice(1))).toEqual([[], ['{"go":true}']]);
});

test('stopping the server cuts a call still open, so the app quits at once', async () => {
  await startServer();
  // A hook whose stdin never comes holds its call open.
  const pending = forward(
    ['hook', 'claude'],
    { env: { MESA_SESSION_ID: 'aaaaaaaa' } },
    () => new Promise<string>(() => {}),
  );
  await vi.waitFor(() => expect(existsSync(socket)).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await stopServer();
  stopServer = async () => {};
  expect(await pending).toBe('lost');
  expect(existsSync(socket)).toBe(false);
});

test('a second mesa serve leaves the live socket to the first', async () => {
  await startServer();
  const first = stopServer;
  const logged = await startServer({ answering: false });
  expect(logged).toEqual(['mesa serve: no Command socket: another mesa serve answers on it\n']);
  await stopServer();
  stopServer = first;
  expect(await forward(['--version'])).toMatchObject({ code: 0 });
});

test('mesa serve listens in no folder that is a symlink', async () => {
  mkdirSync(join(home, 'elsewhere'), { mode: 0o700 });
  symlinkSync(join(home, 'elsewhere'), join(socket, '..'));
  const logged = await startServer({ answering: false });
  expect(logged).toEqual([
    `mesa serve: no Command socket: ${join(socket, '..')} is not a folder\n`,
  ]);
  expect(existsSync(join(home, 'elsewhere/serve.sock'))).toBe(false);
});
