import type { Runner } from '../../lib/process.js';

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
 * The TCP ports this machine listens on, from one `lsof -nP -iTCP -sTCP:LISTEN -Fpn`; undefined
 * when lsof is missing, times out or fails. It exits 1 with no output when nothing listens: that
 * is no port, not a failure.
 */
export async function listeningPorts(run: Runner): Promise<Set<number> | undefined> {
  const lsof = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], 5_000);
  if (lsof.ok) return listeningIn(lsof.stdout);
  return lsof.reason === 'failed' && !lsof.output ? new Set() : undefined;
}
