import type { LockDeps } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import { sessionTitle } from '../record/labels.js';
import type { SessionRecord } from '../record/record.js';
import { listeningPorts } from './listening-ports.js';
import { outputTail } from './output-log.js';

// Advertised URLs (CONTEXT.md): the local addresses a session's dev server printed in its window,
// read from its Output log.

export type AdvertisedUrl = {
  session: string;
  sessionName: string;
  url: string;
  host: string;
  port: number;
  /** Whether a process listens on the port now; null when lsof could not tell. */
  listening: boolean | null;
};

/** How far back in each Output log Mesa looks. */
const LOG_LINES = 2000;
/** An http(s) URL with an explicit port: its scheme, host (a bracketed IPv6 too), port and path. */
const URL_PATTERN =
  /\b(https?):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):(\d{1,5})(?!\d)(\/[^\s'"<>`]*)?/g;
/** This machine's own addresses; the "every interface" ones (`0.0.0.0`, `[::]`) read as `localhost`. */
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const ANY = ['0.0.0.0', '[::]'];

/** Whether `host` is this machine or a private IPv4 address (10/8, 172.16/12, 192.168/16). */
function isLocal(host: string) {
  if (LOOPBACK.includes(host) || ANY.includes(host)) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = octets as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * The local URLs with a port in `lines`, the newest line's per port, in port order, except that a
 * LAN address never replaces this machine's for the same port (Vite prints Local, then Network).
 * `0.0.0.0` and `[::]` (every interface) read as `localhost`, the address a browser opens;
 * trailing punctuation a sentence put after a URL is dropped.
 */
export function advertisedIn(lines: readonly string[]) {
  const byPort = new Map<number, { url: string; host: string; port: number }>();
  for (const line of lines) {
    for (const [, scheme, printed = '', digits, path = ''] of line.matchAll(URL_PATTERN)) {
      const port = Number(digits);
      const lower = printed.toLowerCase();
      const host = ANY.includes(lower) ? 'localhost' : lower;
      if (!isLocal(lower) || port < 1 || port > 65535) continue;
      const kept = byPort.get(port);
      if (kept && LOOPBACK.includes(kept.host) && !LOOPBACK.includes(host)) continue;
      const url = `${scheme}://${host}:${port}${path.replace(/[.,;:!?)\]]+$/, '') || '/'}`;
      byPort.set(port, { url, host, port });
    }
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

/**
 * The URLs `records`' dev servers advertised in the last 2000 lines of each one's Output log,
 * each marked by one `lsof` call (listeningPorts) whether its port is listening (null when lsof
 * could not tell), the listening ones first. A session with no Output log adds nothing. Each log
 * is read from its end (outputTail), so a poll every 10 s reads tens of KB per session.
 */
export async function advertisedUrls(
  deps: { lock: LockDeps; run: Runner; logs: string },
  records: readonly SessionRecord[],
): Promise<AdvertisedUrl[]> {
  const found = records.flatMap((record) =>
    advertisedIn(outputTail(deps.lock, deps.logs, record.id, LOG_LINES) ?? []).map((url) => ({
      session: record.id,
      sessionName: sessionTitle(record),
      ...url,
    })),
  );
  if (!found.length) return [];
  const listening = await listeningPorts(deps.run);
  return found
    .map((url) => ({ ...url, listening: listening ? listening.has(url.port) : null }))
    .sort((a, b) => Number(b.listening === true) - Number(a.listening === true));
}
