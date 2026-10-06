import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';

export const fixedClock =
  (iso = '2026-09-24T12:00:00.000Z'): Clock =>
  () =>
    new Date(iso);

/** ULID-shaped ids 01TEST...0001, 01TEST...0002, and so on: known ahead, so golden files hold. */
export function sequentialIds(): IdSource {
  let n = 0;
  return () => `01TEST${String(++n).padStart(20, '0')}`;
}

/** Ids whose Mesa session ids (their last 8 characters) are `short`, in order: planted records keep the ids a test names. */
export function shortIds(...short: string[]): IdSource {
  let n = 0;
  return () => {
    const id = short[n++];
    if (!id) throw new Error(`shortIds: only ${short.length} ids`);
    return `01TEST${'0'.repeat(12)}${id.toUpperCase()}`;
  };
}

/** UUID-shaped ids 00000000-0000-4000-8000-000000000001 and up, for claude --session-id. */
export function sequentialUuids(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

/** A clock that moves `stepMs` forward on every read: for timeouts and before/after stamps. */
export function steppingClock(iso = '2026-09-24T12:00:00.000Z', stepMs = 1000): Clock {
  let now = new Date(iso).getTime();
  return () => {
    const date = new Date(now);
    now += stepMs;
    return date;
  };
}

/** mulberry32: numbers in [0, 1) from `seed`, the same on every run, so a failing case replays. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
