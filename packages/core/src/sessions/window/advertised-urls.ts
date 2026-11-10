import type { LockDeps } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { sessionTitle } from '../record/labels.js';
import type { SessionRecord } from '../record/record.js';
import { outputTail } from './output-log.js';

// Advertised URLs (CONTEXT.md): the local addresses a session's dev server printed in its window,
// read from its Output log, each marked whether something still listens on its port.

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
const URL_PATTERN = /\b(https?):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):(\d{1,5})(\/[^\s'"<>`]*)?/g;

/** Whether `host` is this machine or a private IPv4 address (10/8, 172.16/12, 192.168/16). */
function local(host: string) {
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(host)) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = octets as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * The local URLs with a port in `lines`, the newest line's per port, in port order. `0.0.0.0`
 * (every interface) reads as `localhost`, the address a browser opens; trailing punctuation a
 * sentence put after a URL is dropped.
 */
export function advertisedIn(lines: readonly string[]) {
  const byPort = new Map<number, { url: string; host: string; port: number }>();
  for (const line of lines) {
    for (const [, scheme, found = '', digits, path = ''] of line.matchAll(URL_PATTERN)) {
      const port = Number(digits);
      const host = found.toLowerCase() === '0.0.0.0' ? 'localhost' : found.toLowerCase();
      if (!local(found.toLowerCase()) || port < 1 || port > 65535) continue;
      const url = `${scheme}://${host}:${port}${path.replace(/[.,;:!?)\]]+$/, '') || '/'}`;
      byPort.set(port, { url, host, port });
    }
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

/** The TCP ports something listens on, from `lsof -Fpn` (`n127.0.0.1:5173`, `n*:3000`). */
export function listeningIn(lsof: string) {
  const ports = new Set<number>();
  for (const line of lsof.split('\n')) {
    const port = line.startsWith('n') ? Number(line.slice(line.lastIndexOf(':') + 1)) : Number.NaN;
    if (Number.isInteger(port)) ports.add(port);
  }
  return ports;
}

/**
 * The URLs each unended session's dev server advertised in the last 2000 lines of its Output
 * log (only `session`'s when given: not_found when it is unknown), each marked by one `lsof` call
 * whether its port is listening (null when lsof is missing or fails), the listening ones first.
 * A session with no Output log adds nothing.
 */
export async function advertisedUrls(
  deps: { lock: LockDeps; run: Runner; logs: string; records: SessionRecord[] },
  session?: string,
): Promise<AdvertisedUrl[]> {
  const records = session
    ? deps.records.filter((record) => record.id === session)
    : deps.records.filter((record) => !record.endedAt);
  if (session && !records.length) throw new MesaError('not_found', `no session ${session}`);
  const found = records.flatMap((record) =>
    advertisedIn(outputTail(deps.lock, deps.logs, record.id, LOG_LINES) ?? []).map((url) => ({
      session: record.id,
      sessionName: sessionTitle(record),
      ...url,
    })),
  );
  if (!found.length) return [];
  const lsof = await deps.run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], 5_000);
  const listening = lsof.ok ? listeningIn(lsof.stdout) : undefined;
  return found
    .map((url) => ({ ...url, listening: listening ? listening.has(url.port) : null }))
    .sort((a, b) => Number(b.listening === true) - Number(a.listening === true));
}
