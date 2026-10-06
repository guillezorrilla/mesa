import type { IdSource } from '../lib/ids.js';

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
