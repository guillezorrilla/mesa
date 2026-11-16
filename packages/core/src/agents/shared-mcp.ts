import { existsSync, unlinkSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import type { Env } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { PROFILE_VAR, SESSION_ID_VAR } from '../lib/window-vars.js';
import type { Stdio } from '../vault/mount/mcp-server.js';
import { DECISIONS_MOUNT, type MesaServer, VAULT_MOUNT } from './mesa-mount.js';

// The Shared MCP server (ADR-0031, CONTEXT.md): one `mesa mcp serve` a profile, on a unix socket in
// the profile's folder, serving every session's mesa-vault and mesa-decisions in place of two
// `mesa` processes a session. A connection's first line binds it to a server and a session; the
// rest is that server's stdio protocol, served by the server's own command.

/** The servers a binding names, by their subcommand's first word, which the relay sends. */
const SERVERS = new Map<string, MesaServer>(
  [VAULT_MOUNT, DECISIONS_MOUNT].map((server) => [server.subcommand[0] ?? '', server]),
);

/** The longest socket path it listens on; macOS caps a unix socket's path at 104 bytes. */
const MAX_SOCKET_PATH = 100;

/** How long it waits with no connection before it exits. */
export const SHARED_MCP_IDLE_MS = 10 * 60_000;

const BindingSchema = z.object({
  server: z.string(),
  session: z.string(),
  profile: z.string(),
});

/**
 * Serves one bound connection: `argv` is this mesa's command for the server, `env` the window
 * variables the binding carries (an empty one unset), `io` the connection.
 */
export type ServeBound = (argv: string[], env: Env, io: Stdio) => Promise<void>;

/** Whether a unix socket at `path` fits the cap. */
export const socketFits = (path: string) => Buffer.byteLength(path) <= MAX_SOCKET_PATH;

/** Whether a server accepts a connection at `path`. */
export function listening(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!existsSync(path)) return resolve(false);
    const socket = connect(path);
    const done = (live: boolean) => {
      socket.destroy();
      resolve(live);
    };
    socket.setTimeout(1000, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

/**
 * A connection: its first line, a binding, picks the server and the session; the lines after go
 * to that server. One whose first line is no binding (a relay's probe) is closed unserved.
 */
async function serveConnection(
  socket: Socket,
  profile: string,
  serve: ServeBound,
  log: (text: string) => void,
) {
  socket.on('error', () => undefined);
  const lines = createInterface({ input: socket, crlfDelay: Number.POSITIVE_INFINITY })[
    Symbol.asyncIterator
  ]();
  const first = await lines.next();
  let parsed: z.infer<typeof BindingSchema> | undefined;
  try {
    parsed = first.done ? undefined : BindingSchema.parse(JSON.parse(first.value));
  } catch {
    parsed = undefined;
  }
  const server = parsed && SERVERS.get(parsed.server);
  if (parsed && server) {
    // Inert unless the binding names a live session of this profile (ADR-0011): the server's own
    // binding check reads these, never the shared process's environment.
    const env = {
      [SESSION_ID_VAR]: parsed.session || undefined,
      [PROFILE_VAR]: parsed.profile || undefined,
    };
    await serve(['--profile', profile, ...server.subcommand], env, {
      lines: { [Symbol.asyncIterator]: () => lines },
      write: (text) => void socket.write(text),
      log,
    }).catch((error: unknown) =>
      log(`mesa mcp serve: ${error instanceof Error ? error.message : String(error)}\n`),
    );
  }
  socket.end();
}

/**
 * Listens at `path` for profile `profile`'s sessions until no connection has been open for
 * `idleMs`, then removes the socket and settles once the last connection has ended. Refused when
 * the path is too long for a unix socket or a server already answers there; a socket file a dead
 * server left is replaced.
 */
export async function serveSharedMcp(
  path: string,
  profile: string,
  serve: ServeBound,
  { idleMs = SHARED_MCP_IDLE_MS, log }: { idleMs?: number; log: (text: string) => void },
): Promise<void> {
  if (!socketFits(path))
    throw new MesaError('usage', `the MCP socket path is too long for a unix socket: ${path}`);
  if (existsSync(path)) {
    if (await listening(path)) throw new MesaError('usage', 'a shared MCP server already runs');
    unlinkSync(path);
  }
  let open = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const server = createServer((socket) => {
    open += 1;
    clearTimeout(idle);
    socket.on('close', () => {
      open -= 1;
      if (open === 0) arm();
    });
    void serveConnection(socket, profile, serve, log);
  });
  const closed = new Promise<void>((resolve) => server.on('close', () => resolve()));
  const arm = () => {
    idle = setTimeout(() => {
      // The file first, so a relay probing from now on falls back to its own server.
      try {
        unlinkSync(path);
      } catch {
        // Gone already.
      }
      server.close();
    }, idleMs);
  };
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => resolve());
  });
  arm();
  await closed;
}

/**
 * Starts the profile's shared server through `start` (a detached mesa, `mcp serve`) unless one
 * answers at `path`, or the path cannot hold a socket; never throws, as each relay falls back to
 * its own server.
 */
export async function ensureSharedMcp(
  path: string,
  start: (args: readonly string[]) => Promise<void>,
): Promise<void> {
  if (!socketFits(path) || (await listening(path))) return;
  await start(['mcp', 'serve']).catch(() => undefined);
}
