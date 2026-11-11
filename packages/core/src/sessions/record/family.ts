import type { SessionRecord } from './record.js';

type Linked = Pick<SessionRecord, 'id' | 'parent' | 'handoffFrom' | 'resumedFrom' | 'resumedBy'>;

/**
 * Where each session reports now (CONTEXT.md, Parent session), over every record: its recorded
 * `parent`, followed forward to the newest session that continues it, a resume (`resumedBy`, or
 * the record naming it `resumedFrom`) or a handoff (the record naming it `handoffFrom`), so a
 * family stays together after a restart or a handoff. A handoff successor's own parent is the
 * session that handed off, which stops: one whose parent is its `handoffFrom` reports to that
 * session's parent instead, and on up the chain. A parent with no record stays as named; none
 * for a session with no parent, or one whose links loop back to itself.
 */
export function familyOf(records: readonly Linked[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const next = new Map<string, string>();
  for (const r of records) {
    if (r.handoffFrom && !next.has(r.handoffFrom)) next.set(r.handoffFrom, r.id);
    if (r.resumedFrom) next.set(r.resumedFrom, r.id);
  }
  for (const r of records) if (r.resumedBy) next.set(r.id, r.resumedBy);
  /** The newest session continuing `id`, `id` itself when none does. */
  const newest = (id: string) => {
    const seen = new Set<string>();
    let at = id;
    for (let to = next.get(at); to && !seen.has(to); to = next.get(at)) {
      seen.add(at);
      at = to;
    }
    return at;
  };
  return (record: Linked): string | undefined => {
    const seen = new Set([record.id]);
    let from = record;
    let parent = record.parent;
    while (parent && parent === from.handoffFrom && !seen.has(parent)) {
      const up = byId.get(parent);
      if (!up) break;
      seen.add(parent);
      from = up;
      parent = up.parent;
    }
    const now = parent && newest(parent);
    return now && !seen.has(now) ? now : undefined;
  };
}

/**
 * `records`, each with a parent given `parentNow`, where it reports now (familyOf): null when it
 * reports to no session (a handoff successor of a session with no parent), never its `parent`.
 */
export function withParentsNow<T extends Linked>(
  records: readonly T[],
): (T & { parentNow?: string | null })[] {
  const parentNow = familyOf(records);
  return records.map((r) => (r.parent ? { ...r, parentNow: parentNow(r) ?? null } : r));
}

/** Where `record` reports now among `records` (familyOf), for one record. */
export const parentNowOf = (records: readonly Linked[], record: Linked) =>
  familyOf(records)(record);

/** How many levels of workers a family nests (CONTEXT.md, Worker brief): one this deep starts none. */
export const MAX_WORKER_DEPTH = 4;

/**
 * How many parents are above each session among `records`, followed where each reports now
 * (familyOf), so a resume or handoff successor adds no level: 0 for a session with no parent.
 */
export function depthOf(records: readonly Linked[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const parentNow = familyOf(records);
  return (record: Linked): number => {
    const seen = new Set([record.id]);
    let depth = 0;
    for (let up = parentNow(record); up && !seen.has(up); ) {
      depth++;
      seen.add(up);
      const found = byId.get(up);
      up = found && parentNow(found);
    }
    return depth;
  };
}
