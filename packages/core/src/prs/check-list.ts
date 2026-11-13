import type { PrCheck } from './reader.js';

const RANK: Record<PrCheck['state'], number> = { failing: 0, pending: 1, passing: 2, skipped: 3 };

/** A PR's checks as the detail lists them: failing first, then running, passing, skipped; by name within. */
export const orderChecks = (checks: readonly PrCheck[]): PrCheck[] =>
  [...checks].sort((a, b) => RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name));
