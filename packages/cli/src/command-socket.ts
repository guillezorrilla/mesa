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
//   client: {"version","build","argv","cwd","env","startedAt"}
//   server: {"ready":true}, or {"here":true} for another build: the client runs it itself
//   client: {"go":true}, only while it still waits; a client that gave up closes instead, so a
//           call runs once, here or there
//   server: {"stdin":true}, when the command reads its stdin; client: {"stdin":"..."}, or
//           {"tooLarge":true} past the cap, which hands the call back with {"here":true}
//   server: {"code","stdout","stderr","exec"?}, the reply, then it ends the connection; or
//           {"here":true} for a command that runs in its own process (Command.serves, .ownProcess)

/** The most a call may send, its stdin with it, and the most its reply may carry. */
export const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

/** What a client sends first: the call, the environment it runs in, and which Mesa sends it. */
export type Forwarded = {
  version: string;
  /** Which build of the version (version.ts BUILD): a server of another build hands it back. */
  build: string;
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  /** When the caller's process started, for a hook's budget (ADR-0019), in ms since the epoch. */
  startedAt: number;
};

/** Which Mesa a server or client is. */
export type Identity = Pick<Forwarded, 'version' | 'build'>;

const line = (message: object) => `${JSON.stringify(message)}\n`;
const send = (socket: Socket, message: object) => socket.write(line(message));

/** A line's JSON object, or an empty one when it is none. */
const parse = (text: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
};

/** A request header, or undefined when the line is none. */
function parseForwarded(text: string): Forwarded | undefined {
  const v = parse(text);
  const strings = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((x) => typeof x === 'string');
  const ok =
    typeof v.version === 'string' &&
    typeof v.build === 'string' &&
    strings(v.argv) &&
    typeof v.cwd === 'string' &&
    typeof v.env === 'object' &&
    v.env !== null &&
    Object.values(v.env).every((x) => typeof x === 'string') &&
    typeof v.startedAt === 'number';
  return ok ? (v as Forwarded) : undefined;
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
 * Makes `dir` this user's private folder, or throws: a symlink or anything but a folder is
 * refused, and only the folder's owner can chmod it.
 */
function claimFolder(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${dir} is not a folder`);
  chmodSync(dir, 0o700);
}

/**
 * Answers forwarded calls on `path` with `runOne` until closed. The folder is made private first
 * (a process that reaches the socket runs commands as this user); a socket a dead server left is
 * replaced, and one a live server answers on is kept, so the first server of a profile answers.
 * Closing cuts the calls still open, so a long one never holds up the app's quit.
 */
export async function listenCommands(path: string, identity: Identity, runOne: RunOne) {
  if (!fitsUnixSocket(path)) throw new Error(`its path is too long for a unix socket: ${path}`);
  claimFolder(dirname(path));
  if (await answers(path)) throw new Error('another mesa serve answers on it');
  const stale = lstatSync(path, { throwIfNoEntry: false });
  if (stale && !stale.isSocket()) throw new Error(`${path} is not a socket`);
  rmSync(path, { force: true });
  const open = new Set<Socket>();
  // Until the socket is 0600, no call is taken.
  let ready = false;
  const server = createServer((socket) => {
    if (!ready) return void socket.destroy();
    open.add(socket);
    socket.on('close', () => open.delete(socket));
    socket.on('error', () => undefined);
    let received = 0;
    socket.on('data', (chunk) => {
      received += chunk.length;
      // The handshake's own lines ride on top of the cap.
      if (received > MAX_MESSAGE_BYTES + 1024) socket.destroy();
    });
    // A caller gone mid-call has no one to answer.
    answer(socket, identity, runOne).then(
      () => socket.end(),
      () => socket.destroy(),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, resolve);
  });
  chmodSync(path, 0o600);
  ready = true;
  const { ino } = lstatSync(path);
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of open) socket.destroy();
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
async function answer(socket: Socket, identity: Identity, runOne: RunOne) {
  const lines = createInterface({ input: socket, crlfDelay: Number.POSITIVE_INFINITY })[
    Symbol.asyncIterator
  ]();
  const next = async () => {
    const read = await lines.next();
    return read.done ? undefined : parse(read.value);
  };
  const first = await lines.next();
  if (first.done) return;
  const call = parseForwarded(first.value);
  if (!call) return send(socket, refused('mesa serve: not a forwarded call'));
  // Another build's commands may read and write the profile differently: it runs its own.
  if (call.version !== identity.version || call.build !== identity.build)
    return send(socket, { here: true });
  send(socket, { ready: true });
  // A caller that gave up waiting closed instead, and runs the call itself.
  if ((await next())?.go !== true) return;
  let tooLarge = false;
  let input: Promise<string> | undefined;
  const stdin = () => {
    input ??= (async () => {
      send(socket, { stdin: true });
      const message = await next();
      if (message?.tooLarge === true) tooLarge = true;
      if (typeof message?.stdin !== 'string')
        throw new Error('mesa serve: the caller sent no stdin');
      return message.stdin;
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
  // Refused before it ran, or its stdin never came: the caller runs it with its own.
  if (out.ownProcess || tooLarge) return send(socket, { here: true });
  const reply = line({ code: out.code, stdout: out.stdout, stderr: out.stderr, exec: out.exec });
  socket.write(
    Buffer.byteLength(reply) <= MAX_MESSAGE_BYTES
      ? reply
      : line({
          code: 1,
          stdout: '',
          stderr: `mesa: the call ran, but its output passed ${MAX_MESSAGE_BYTES / 1024 / 1024} MiB, the most the Command socket carries\n`,
        }),
  );
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

/** How long a client waits: for the server to take the call, and for its reply (none: no limit). */
export type Deadlines = { readyMs: number; replyMs?: number };

/**
 * Runs `call` on the Command server at `path`. Its reply; `undefined` when no server of this
 * build took it, it did not take it within `readyMs`, the call is over the cap, or the server
 * handed it back, so the caller runs it itself; `lost` when the connection ended, or `replyMs`
 * passed, after the server took it, so it may have run. Reads stdin, with `readStdin`, only when
 * the command asks for it; one that fails to read ends the call with a failure, never an empty
 * payload.
 */
export function forwardCall(
  path: string,
  uid: number,
  call: Forwarded,
  readStdin: () => Promise<string>,
  deadlines: Deadlines,
): Promise<Reply | 'lost' | undefined> {
  const header = line(call);
  if (
    !fitsUnixSocket(path) ||
    !isPrivate(dirname(path), uid) ||
    Buffer.byteLength(header) > MAX_MESSAGE_BYTES
  )
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const socket = connect(path);
    let taken = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (result: Reply | 'lost' | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const gone = () => done(taken ? 'lost' : undefined);
    socket.on('error', gone);
    socket.on('close', gone);
    socket.on('connect', () => socket.write(header));
    timer = setTimeout(gone, deadlines.readyMs);
    let received = 0;
    socket.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_MESSAGE_BYTES + 1024)
        done({
          code: 1,
          stdout: '',
          stderr: "mesa: the Command server's reply passed the most it may carry\n",
        });
    });
    const lines = createInterface({ input: socket, crlfDelay: Number.POSITIVE_INFINITY });
    // The socket's own error settles it; readline passes it on too.
    lines.on('error', () => undefined);
    lines.on('line', (text) => {
      const message = parse(text);
      if (message.here === true) return done(undefined);
      if (message.ready === true) {
        taken = true;
        clearTimeout(timer);
        if (deadlines.replyMs !== undefined) timer = setTimeout(gone, deadlines.replyMs);
        return void send(socket, { go: true });
      }
      if (message.stdin === true)
        return void readStdin().then(
          (text) =>
            send(
              socket,
              Buffer.byteLength(header) + Buffer.byteLength(line({ stdin: text })) >
                MAX_MESSAGE_BYTES
                ? { tooLarge: true }
                : { stdin: text },
            ),
          (error: unknown) =>
            done({
              code: 1,
              stdout: '',
              stderr: `mesa: could not read stdin: ${error instanceof Error ? error.message : String(error)}\n`,
            }),
        );
      if (typeof message.code === 'number')
        done({
          code: message.code,
          stdout: typeof message.stdout === 'string' ? message.stdout : '',
          stderr: typeof message.stderr === 'string' ? message.stderr : '',
          ...(Array.isArray(message.exec) ? { exec: message.exec as string[] } : {}),
        });
    });
  });
}
