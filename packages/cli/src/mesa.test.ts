import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profilePaths, shortTempDir } from '@mesa/core/testing';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { runCli } from './cli.js';
import { cliDeps, fakeCommandServer } from './testing.js';
import { VERSION } from './version.js';

// The real entrypoint, bundled from source as the release bundles it (scripts/release/build.sh),
// run as a process against a Command socket that stalls or drops (ADR-0032).

const core = (file: string) => fileURLToPath(new URL(`../../core/src/${file}`, import.meta.url));
let bundleDir = '';
let entry = '';

beforeAll(async () => {
  bundleDir = shortTempDir();
  // version.ts reads ../package.json beside the bundle, as it does beside dist/.
  writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({ version: VERSION }));
  entry = join(bundleDir, 'dist/mesa.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./mesa.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: entry,
    logLevel: 'silent',
    banner: {
      js: "import { createRequire as __mesaRequire } from 'node:module'; const require = __mesaRequire(import.meta.url);",
    },
    plugins: [
      {
        name: 'core-from-source',
        setup: (b) => {
          const paths: Record<string, string> = {
            '@mesa/core': core('index.ts'),
            '@mesa/core/paths': core('profile/paths.ts'),
          };
          b.onResolve({ filter: /^@mesa\/core(\/paths)?$/ }, (args) => ({
            path: paths[args.path] ?? '',
          }));
        },
      },
    ],
  });
}, 60_000);
afterAll(() => rmSync(bundleDir, { recursive: true, force: true }));

let home = '';
let socket = '';
let closeFake = async () => {};
beforeEach(async () => {
  home = shortTempDir();
  socket = profilePaths(home, 'default').commandSocket;
  await runCli(['init', '--vault', 'vault'], cliDeps(home));
});
afterEach(async () => {
  await closeFake();
  rmSync(home, { recursive: true, force: true });
});

/** The bundled `mesa argv`, in `home`, as a hook of session aaaaaaaa; in a terminal with `tty`. */
function mesa(argv: string[], { input = '', tty = false } = {}) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !key.startsWith('MESA_')) env[key] = value;
  Object.assign(env, {
    HOME: home,
    MESA_PROFILE: 'default',
    MESA_SESSION_ID: 'aaaaaaaa',
    MESA_NO_INSTALL_PING: '1',
  });
  const command = [process.execPath, entry, ...argv];
  // script(1) gives the command a terminal; its flags differ between macOS and util-linux.
  const [file, args] = !tty
    ? [command[0] ?? '', command.slice(1)]
    : process.platform === 'darwin'
      ? ['script', ['-q', '/dev/null', ...command]]
      : ['script', ['-qec', command.map((a) => `'${a}'`).join(' '), '/dev/null']];
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    // script(1) reads the terminal settings of its own stdin, which a pipe (a socket here) lacks.
    const child = spawn(file, args, {
      env,
      cwd: home,
      stdio: [tty ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin?.end(input);
  });
}

const STOP = JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop' });
const recorded = () => {
  const log = join(profilePaths(home, 'default').events, 'aaaaaaaa.jsonl');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0;
};

test('a hook whose server drops the call after taking it runs again here, and is recorded', async () => {
  const fake = await fakeCommandServer(socket, (lines, client) => {
    if (lines.length === 1) client.write('{"ready":true}\n');
    if (lines.length === 2) client.destroy();
  });
  closeFake = fake.close;
  const out = await mesa(['--json', 'hook', 'claude'], { input: STOP });
  expect(out.code).toBe(0);
  expect(JSON.parse(out.stdout).data).toEqual({ recorded: true, event: 'Stop' });
  expect(recorded()).toBe(1);
  expect(fake.calls.map((lines) => lines.slice(1))).toEqual([['{"go":true}']]);
}, 30_000);

test('another call the server drops fails, as it may have run', async () => {
  const fake = await fakeCommandServer(socket, (lines, client) => {
    if (lines.length === 1) client.write('{"ready":true}\n');
    if (lines.length === 2) client.destroy();
  });
  closeFake = fake.close;
  const out = await mesa(['--json', 'awake', 'on']);
  expect(out).toMatchObject({
    code: 1,
    stdout: '',
    stderr: "mesa: the app's Command server ended before it answered; the call may have run\n",
  });
}, 30_000);

test('a hook whose server never answers runs here within its deadline', async () => {
  const fake = await fakeCommandServer(socket, () => {});
  closeFake = fake.close;
  const started = Date.now();
  const out = await mesa(['--json', 'hook', 'claude'], { input: STOP });
  expect(out.code).toBe(0);
  expect(recorded()).toBe(1);
  expect(Date.now() - started).toBeLessThan(10_000);
  expect(fake.calls).toHaveLength(1);
}, 30_000);

test('a call from a terminal runs here and never reaches the socket', async () => {
  const fake = await fakeCommandServer(socket, () => {});
  closeFake = fake.close;
  const out = await mesa(['--version'], { tty: true });
  expect(out.stdout).toContain(VERSION);
  expect(fake.calls).toEqual([]);
}, 30_000);

test('with no server, a call runs here as it always did', async () => {
  mkdirSync(join(socket, '..'), { recursive: true, mode: 0o700 });
  expect(await mesa(['--json', 'hook', 'claude'], { input: STOP })).toMatchObject({ code: 0 });
  expect(recorded()).toBe(1);
}, 30_000);
