import { HttpsUrl } from '../git/pull-requests.js';
import type { PrCheck, PrRead } from './reader.js';

/** Check states, the order the detail lists and counts them in: failing first. */
export const CHECK_STATES = ['failing', 'pending', 'passing', 'skipped'] as const;

/** A PR's checks as the detail lists them: in CHECK_STATES order, by name within. */
export const orderChecks = (checks: readonly PrCheck[]): PrCheck[] =>
  [...checks].sort(
    (a, b) =>
      CHECK_STATES.indexOf(a.state) - CHECK_STATES.indexOf(b.state) || a.name.localeCompare(b.name),
  );

/** A check's details link when it is one plain HTTPS link (HttpsUrl); else none. */
export const checkLink = (url: string | null | undefined): { url?: string } =>
  url && HttpsUrl.safeParse(url).success ? { url } : {};

/** The checks rolled up: one failing fails them, one running keeps them pending; null with none. */
export function rollUp(checks: readonly PrCheck[]): PrRead['checks'] {
  if (!checks.length) return null;
  if (checks.some((c) => c.state === 'failing')) return 'failing';
  if (checks.some((c) => c.state === 'pending')) return 'pending';
  return 'passing';
}
