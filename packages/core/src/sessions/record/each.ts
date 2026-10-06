import { type ErrorCode, MesaError, toFail } from '../../lib/result.js';

/** One id's outcome in a many-session action: its result, or the error that stopped it. */
export type ItemResult<T> =
  | { id: string; ok: true; result: T }
  | { id: string; ok: false; error: { code: ErrorCode; message: string }; skipped?: true };

export type EachResult<T> = { items: ItemResult<T>[] };

/**
 * Runs `step` on each id, one at a time in first-seen order, keeping a failure as an item and
 * going on. Every id is checked with `exists` first: any unknown one throws `not_found` naming
 * them all, and no step runs.
 */
export async function applyEach<R>(
  ids: readonly string[],
  exists: (id: string) => boolean,
  step: (id: string) => Promise<R>,
): Promise<EachResult<R>> {
  const unique = [...new Set(ids)];
  const unknown = unique.filter((id) => !exists(id));
  if (unknown.length > 0) {
    throw new MesaError('not_found', `no session ${unknown.join(', ')}`);
  }
  const items: ItemResult<R>[] = [];
  for (const id of unique) {
    try {
      items.push({ id, ok: true, result: await step(id) });
    } catch (error) {
      items.push({ id, ok: false, error: toFail(error).error });
    }
  }
  return { items };
}
