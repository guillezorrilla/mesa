import { chmodSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fitsUnixSocket } from '@mesa/core/paths';
import { type Reply, type RunOne, refused } from './serve.js';

// The Command socket (ADR-0032): `mesa serve` also answers on a unix socket in the profile's
// private `run/` folder, so a `mesa` start forwards its call there instead of loading core. Node
// builtins only (and core's paths), since the entrypoint imports it before core.
//
// One call a connection, one JSON message a line each way:
//   client: {"version","argv","cwd","env","startedAt"}
//   server: {"stdin":true}, only when the command reads its stdin; client: {"stdin":"..."}
//   server: {"code","stdout","stderr","exec"?}, the reply, then the server ends the connection;
//           or {"here":true}, before running anything, when the client should run it itself.

/** The most one call may send, its stdin with it (a hook's payload): the connection ends past it. */
export const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

/** What a client sends first: the call, and the environment it runs in. */
export type Forwarded = {
  version: string;
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  /** When the caller's process started, for a hook's budget (ADR-0019), in ms since the epoch. */
  startedAt: number;
};

const send = (socket: Socket, message: object) => socket.write(`${JSON.stringify(message)}\n`);

/** A request header, or undefined when the line is none. */
function parseForwarded(line: string): Forwarded | undefined {
  try {
    const v = JSON.parse(line) as Partial<Forwarded>;
    const strings = (a: unknown): a is string[] =>
      Array.isArray(a) && a.every((x) => typeof x === 'string');
    const ok =
      typeof v.version === 'string' &&
      strings(v.argv) &&
      typeof v.cwd === 'string' &&
      typeof v.env === 'object' &&
      v.env !== null &&
      Object.values(v.env).every((x) => typeof x === 'string') &&
      typeof v.startedAt === 'number';
    return ok ? (v as Forwarded) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a server accepts connections at `path`. */
const answers = (path: string) =>
  new Promise<boolean>((resolve) => {
    const probe = connect(path);
    probe.on('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.on('error', () => resolve(false));
  });

/**
 * Answers forwarded calls on `path` with `runOne` until closed. The folder is made private first
 * (a process that reaches the socket runs commands as this user); a socket a dead server left is
 * replaced, and one a live server answers on is kept, so the first server of a profile answers.
 */
export async function listenCommands(path: string, version: string, runOne: RunOne) {
  if (!fitsUnixSocket(path)) throw new Error(`its path is too long for a unix socket: ${path}`);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  if (await answers(path)) throw new Error('another mesa serve answers on it');
  rmSync(path, { force: true });
  const server = createServer((socket) => {
    socket.on('error', () => undefined);
    let received = 0;
    socket.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_REQUEST_BYTES) socket.destroy();
    });
    // A caller gone mid-call has no one to answer.
    answer(socket, version, runOne).then(
      () => socket.end(),
      () => socket.destroy(),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, resolve);
  });
  chmodSync(path, 0o600);
  const { ino } = lstatSync(path);
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Only our own socket: another server may have replaced it since.
        try {
          if (lstatSync(path).ino === ino) rmSync(path);
        } catch {
          // Gone already.
        }
      }),
  };
}

/** One connection's call, from its header to its reply. */
async function answer(socket: Socket, version: string, runOne: RunOne) {
  const lines = createInterface({ input: socket, crlfDelay: Number.POSITIVE_INFINITY })[
    Symbol.asyncIterator
  ]();
  const first = await lines.next();
  if (first.done) return;
  const call = parseForwarded(first.value);
  if (!call) return send(socket, refused('mesa serve: not a forwarded call'));
  // Another Mesa's commands may read and write the profile differently: it runs its own.
  if (call.version !== version) return send(socket, { here: true });
  let input: Promise<string> | undefined;
  const stdin = () => {
    input ??= (async () => {
      send(socket, { stdin: true });
      const next = await lines.next();
      const value = next.done ? undefined : (JSON.parse(next.value) as { stdin?: unknown }).stdin;
      if (typeof value !== 'string') throw new Error('mesa serve: the caller sent no stdin');
      return value;
    })();
    return input;
  };
  const out = await runOne(call.argv, stdin, {
    env: call.env,
    cwd: call.cwd,
    startedAt: new Date(call.startedAt),
  }).catch(
    (error: unknown): Reply => ({
      code: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    }),
  );
  if (out.ownProcess) return send(socket, { here: true });
  send(socket, { code: out.code, stdout: out.stdout, stderr: out.stderr, exec: out.exec });
}

/**
 * Whether `dir` is a folder only `uid` can enter, so the socket in it is one this user's server
 * made: a symlink, another owner, or any group or other bit fails.
 */
const isPrivate = (dir: string, uid: number) => {
  try {
    const stat = lstatSync(dir);
    return stat.isDirectory() && stat.uid === uid && (stat.mode & 0o077) === 0;
  } catch {
    return false;
  }
};

/**
 * Runs `call` on the Command server at `path`: its reply; `undefined` when no server of this
 * version took it, so the caller runs it itself; `lost` when the connection ended after the call
 * was sent and before its reply, so it may have run. Reads stdin, with `readStdin`, only when the
 * command asks for it.
 */
export function forwardCall(
  path: string,
  uid: number,
  call: Forwarded,
  readStdin: () => Promise<string>,
): Promise<Reply | 'lost' | undefined> {
  if (!fitsUnixSocket(path) || !isPrivate(dirname(path), uid)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const socket = connect(path);
    let sent = false;
    let settled = false;
    const done = (result: Reply | 'lost' | undefined) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.on('error', () => done(sent ? 'lost' : undefined));
    socket.on('close', () => done(sent ? 'lost' : undefined));
    socket.on('connect', () => {
      sent = true;
      send(socket, call);
    });
    const lines = createInterface({ input: socket, crlfDelay: Number.POSITIVE_INFINITY });
    // The socket's own error settles it; readline passes it on too.
    lines.on('error', () => undefined);
    lines.on('line', (line) => {
      let message: Partial<Reply> & { stdin?: true; here?: true };
      try {
        message = JSON.parse(line);
      } catch {
        return done('lost');
      }
      if (message.here) return done(undefined);
      if (message.stdin)
        return void readStdin().then(
          (text) => send(socket, { stdin: text }),
          () => send(socket, { stdin: '' }),
        );
      if (typeof message.code === 'number')
        done({
          code: message.code,
          stdout: message.stdout ?? '',
          stderr: message.stderr ?? '',
          ...(message.exec ? { exec: message.exec } : {}),
        });
    });
  });
}
