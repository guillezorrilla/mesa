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

/** `records`, each with a parent given `parentNow`, where it reports now (familyOf). */
export function withParentsNow<T extends Linked>(
  records: readonly T[],
): (T & { parentNow?: string })[] {
  const parentNow = familyOf(records);
  return records.map((r) => {
    const now = r.parent && parentNow(r);
    return now ? { ...r, parentNow: now } : r;
  });
}
