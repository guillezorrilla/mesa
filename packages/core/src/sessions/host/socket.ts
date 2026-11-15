import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';
import { CLAUDE_PERMISSION_MODES } from '../../agents/names.js';
import { lineSplitter } from '../../lib/lines.js';
import { MesaError } from '../../lib/result.js';

// A host's unix socket (ADR-0029): one JSON request per line in, one reply per line out. `mesa
// send`, the app and the phone reach a Structured session's agent through it.

const RequestSchema = z.discriminatedUnion('type', [
  /** Whether a host listens, which changes nothing. */
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('send'), text: z.string().min(1) }),
  z.object({
    type: z.literal('allow'),
    requestId: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    /** The request's suggestions, for "allow always". */
    permissions: z.array(z.unknown()).optional(),
  }),
  z.object({ type: z.literal('deny'), requestId: z.string().min(1), message: z.string() }),
  z.object({ type: z.literal('interrupt') }),
  z.object({ type: z.literal('mode'), mode: z.enum(CLAUDE_PERMISSION_MODES) }),
  z.object({ type: z.literal('stop') }),
]);

export type HostRequest = z.infer<typeof RequestSchema>;
/**
 * `queued`: a message sent while a turn runs, which claude takes when the turn ends. `unsure`: the
 * request was written but no answer came, so whether the host acted on it is unknown.
 */
export type HostReply =
  | { ok: true; queued?: boolean }
  | { ok: false; error: string; unsure?: true };

export const hostSocket = (dir: string, id: string) => join(dir, `${id}.sock`);

/** How long a client waits for a host's reply. */
const ASK_TIMEOUT_MS = 5000;

/** Sends `request` to the host at `path`; none when no host listens there, so nothing was sent. */
export function askHost(path: string, request: HostRequest): Promise<HostReply | undefined> {
  return new Promise((resolve) => {
    if (!existsSync(path)) return resolve(undefined);
    const socket = connect(path);
    const done = (reply: HostReply | undefined) => {
      socket.destroy();
      resolve(reply);
    };
    let connected = false;
    const lost = (error: string) =>
      done(connected ? { ok: false, error, unsure: true } : undefined);
    socket.on('connect', () => {
      connected = true;
    });
    socket.setTimeout(ASK_TIMEOUT_MS, () => lost('the host did not answer'));
    socket.on('error', () => lost('the host connection broke'));
    socket.setEncoding('utf8');
    const lines = lineSplitter((line) => {
      try {
        done(JSON.parse(line) as HostReply);
      } catch {
        done({ ok: false, error: 'the host replied with something other than JSON' });
      }
    });
    socket.on('data', lines.push);
    socket.write(`${JSON.stringify(request)}\n`);
  });
}

/**
 * Listens at `path` and answers each request with `handle`. A socket file a dead host left is
 * replaced; one a live host answers is refused, so one session has one host.
 */
export async function serveHost(path: string, handle: (request: HostRequest) => HostReply) {
  // A unix socket's path is capped at 104 bytes on macOS (sun_path).
  if (Buffer.byteLength(path) > 103)
    throw new MesaError('usage', `the host socket path is too long for a unix socket: ${path}`);
  if (existsSync(path)) {
    if (await askHost(path, { type: 'ping' }))
      throw new MesaError('usage', 'a host already runs for this session');
    unlinkSync(path);
  }
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('error', () => undefined);
    const lines = lineSplitter((line) => {
      let reply: HostReply;
      try {
        const parsed = RequestSchema.safeParse(JSON.parse(line));
        reply = parsed.success
          ? handle(parsed.data)
          : { ok: false, error: `not a host request: ${parsed.error.issues[0]?.message}` };
      } catch {
        reply = { ok: false, error: 'not JSON' };
      }
      socket.write(`${JSON.stringify(reply)}\n`);
    });
    socket.on('data', lines.push);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => resolve());
  });
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        try {
          unlinkSync(path);
        } catch {
          // Gone already.
        }
      }),
  };
}
