import { type ErrorCode, MesaError, toFail } from '../lib/result.js';

type Linked = { id: string; parent?: string };

/** The exact parent-linked subtree, children before parents so a queued child is cancelled first. */
export function descendantOrder<T extends Linked>(records: readonly T[], id: string): T[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  if (!byId.has(id)) throw new MesaError('not_found', `no session ${id}`);
  const children = new Map<string, T[]>();
  for (const record of records) {
    if (!record.parent) continue;
    const group = children.get(record.parent) ?? [];
    group.push(record);
    children.set(record.parent, group);
  }
  for (const group of children.values()) group.sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const ordered: T[] = [];
  const visit = (record: T) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    for (const child of children.get(record.id) ?? []) visit(child);
    ordered.push(record);
  };
  visit(byId.get(id) as T);
  return ordered;
}

export type DescendantResult<T> = {
  root: string;
  items: (
    | { id: string; ok: true; result: T }
    | { id: string; ok: false; error: { code: ErrorCode; message: string }; skipped?: true }
  )[];
};

/** Apply an explicitly confirmed subtree one item at a time, preserving failures for retry. */
export async function applyDescendants<T extends Linked, R>(
  records: readonly T[],
  id: string,
  step: (record: T) => Promise<R>,
  expected?: readonly string[],
): Promise<DescendantResult<R>> {
  const ordered = descendantOrder(records, id);
  if (expected && ordered.map((record) => record.id).join(',') !== expected.join(',')) {
    throw new MesaError('usage', 'session descendants changed; review and confirm them again');
  }
  const done = new Map<string, boolean>();
  const items: DescendantResult<R>['items'] = [];
  for (const record of ordered) {
    // ponytail: the subtree is a handful of sessions; index children if this scan grows costly.
    const failedChild = ordered.find(
      (child) => child.parent === record.id && done.get(child.id) === false,
    );
    if (failedChild) {
      items.push({
        id: record.id,
        ok: false,
        skipped: true,
        error: { code: 'usage', message: `descendant ${failedChild.id} did not complete` },
      });
      done.set(record.id, false);
      continue;
    }
    try {
      items.push({ id: record.id, ok: true, result: await step(record) });
      done.set(record.id, true);
    } catch (error) {
      items.push({ id: record.id, ok: false, error: toFail(error).error });
      done.set(record.id, false);
    }
  }
  return { root: id, items };
}
