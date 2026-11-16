import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { shortTempDir } from '../testing/index.js';
import { launchMounts } from './mesa-mount.js';
import { ensureSharedMcp, listening, type ServeBound, serveSharedMcp } from './shared-mcp.js';

// The Shared MCP server (ADR-0031) over a real unix socket, and the relay a mount runs, in a real sh.

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** A client on `path`: sends `lines`, and resolves with everything it read once the server ends. */
function client(path: string, ...lines: string[]) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(path);
    let read = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      read += chunk;
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(read));
    socket.write(lines.map((line) => `${line}\n`).join(''));
    socket.end();
  });
}

/** A bound connection's server that echoes its argv, env, and lines; the pids serving each. */
const echo: ServeBound = async (argv, env, io) => {
  io.write(`${JSON.stringify({ argv, env, pid: process.pid })}\n`);
  for await (const line of io.lines) io.write(`echo ${line}\n`);
};

const binding = (server: string, session = 'a1b2c3d4', profile = 'default') =>
  JSON.stringify({ server, session, profile });

test('one process serves two connections, each its own server and session, with --profile its own', async () => {
  const path = join(shortTempDir(), 'mcp.sock');
  const served = serveSharedMcp(path, 'default', echo, { idleMs: 300, log: () => {} });
  await expect.poll(() => listening(path)).toBe(true);
  const [vault, decisions] = await Promise.all([
    client(path, binding('vault'), 'one'),
    client(path, binding('decisions', 'e5f6a7b8', ''), 'two'),
  ]);
  const head = (out: string) => JSON.parse(out.split('\n')[0] ?? '');
  expect(head(vault)).toEqual({
    argv: ['--profile', 'default', 'vault', 'mcp'],
    env: { MESA_SESSION_ID: 'a1b2c3d4', MESA_PROFILE: 'default' },
    pid: process.pid,
  });
  expect(vault.split('\n')[1]).toBe('echo one');
  // An empty variable is unset, so the server's binding check refuses it as it would its own.
  expect(head(decisions)).toEqual({
    argv: ['--profile', 'default', 'decisions', 'mcp'],
    env: { MESA_SESSION_ID: 'e5f6a7b8' },
    pid: process.pid,
  });
  expect(decisions.split('\n')[1]).toBe('echo two');
  // A probe, and a first line that is no binding, are closed unserved.
  expect(await client(path)).toBe('');
  expect(await client(path, binding('shell'), 'ls')).toBe('');
  expect(await client(path, 'not json')).toBe('');
  // A second server on the same socket is refused.
  await expect(serveSharedMcp(path, 'default', echo, { log: () => {} })).rejects.toThrow(
    'a shared MCP server already runs',
  );
  await served;
});

test('it exits once no connection has been open for its idle time, removing its socket', async () => {
  const path = join(shortTempDir(), 'mcp.sock');
  let ended = false;
  const served = serveSharedMcp(path, 'default', echo, { idleMs: 200, log: () => {} }).then(() => {
    ended = true;
  });
  await expect.poll(() => listening(path)).toBe(true);
  // A connection open past the idle time keeps it up.
  const held = connect(path);
  held.write(`${binding('vault')}\n`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(ended).toBe(false);
  held.end();
  await served;
  expect(existsSync(path)).toBe(false);
});

test('a socket path too long for a unix socket is refused, and ensure starts nothing for it', async () => {
  const path = join(shortTempDir(), 'x'.repeat(100), 'mcp.sock');
  await expect(serveSharedMcp(path, 'default', echo, { log: () => {} })).rejects.toThrow(
    'too long for a unix socket',
  );
  const started: (readonly string[])[] = [];
  await ensureSharedMcp(path, async (args) => void started.push(args));
  expect(started).toEqual([]);
});

test('ensure starts `mcp serve` unless a server answers, and never throws', async () => {
  const path = join(shortTempDir(), 'mcp.sock');
  const started: (readonly string[])[] = [];
  await ensureSharedMcp(path, async (args) => void started.push(args));
  expect(started).toEqual([['mcp', 'serve']]);
  await ensureSharedMcp(path, async () => {
    throw new Error('no tmux');
  });
  const served = serveSharedMcp(path, 'default', echo, { idleMs: 300, log: () => {} });
  await expect.poll(() => listening(path)).toBe(true);
  await ensureSharedMcp(path, async (args) => void started.push(args));
  expect(started).toHaveLength(1);
  await served;
});

test('the mount relays to the socket, falling back to its own server', () => {
  const mounts = launchMounts(['/opt/node', '/src/mesa.js'], {
    decisions: true,
    socket: '/h/.mesa/default/mcp.sock',
  });
  expect(mounts.vault.command).toBe('/bin/sh');
  expect(mounts.vault.args.slice(2)).toEqual([
    'mesa-relay',
    '/h/.mesa/default/mcp.sock',
    'vault',
    '/opt/node',
    '/src/mesa.js',
    'vault',
    'mcp',
  ]);
  expect(mounts.decisions?.args.slice(2)).toEqual([
    'mesa-relay',
    '/h/.mesa/default/mcp.sock',
    'decisions',
    '/opt/node',
    '/src/mesa.js',
    'decisions',
    'mcp',
  ]);
  // Without a socket, the server's own process, as Antigravity's global entry is.
  expect(launchMounts(['/opt/node', '/src/mesa.js'], { decisions: false }).vault).toEqual({
    command: '/opt/node',
    args: ['/src/mesa.js', 'vault', 'mcp'],
  });
});

/** Runs the vault mount for `socket` in a real sh, with `fallback` as its mesa; what it printed. */
function runRelay(socket: string, fallback: string[], input: string) {
  const { command, args } = launchMounts(fallback, { decisions: false, socket }).vault;
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, {
      env: { PATH: process.env.PATH, MESA_SESSION_ID: 'a1b2c3d4', MESA_PROFILE: 'default' },
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('close', () => resolve(out));
    child.stdin.end(input);
  });
}

test('the relay execs its own server when no server answers at the socket', async () => {
  const dir = shortTempDir();
  // The stand-in mesa prints its argv and its stdin.
  const out = await runRelay(
    join(dir, 'mcp.sock'),
    ['/bin/sh', '-c', 'echo "own $*"; cat', 'mesa'],
    'ping\n',
  );
  expect(out).toBe('own vault mcp\nping\n');
});

test('the relay sends the binding and pipes stdio through when a server answers', async () => {
  const path = join(shortTempDir(), 'mcp.sock');
  // A plain socket stand-in, which echoes what each connection sent once it ends.
  const server = createServer((socket) => {
    let read = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      read += chunk;
    });
    socket.on('end', () => socket.end(`got ${read}`));
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  stops.push(() => server.close());
  const out = await runRelay(path, ['/bin/false'], 'ping\n');
  expect(out).toBe('got {"server":"vault","session":"a1b2c3d4","profile":"default"}\nping\n');
});
