import type { SessionRow } from './rows.js';

/** A board row placed in the session tree: `depth` 0 at the top, 1 for a child, and so on. */
export type TreeRow = SessionRow & { depth: number };

/**
 * The board as a tree: each row followed by its children, and theirs. Siblings, and the rows at
 * the top, rank by the highest attention in their subtree, so a child waiting on a person lifts
 * its whole branch (CONTEXT.md, Attention score); ties keep the board's order.
 *
 * A row sits under where it reports now (`parentNow`, familyOf): the session it names, or the
 * newest one that session was resumed or handed off as, so a family stays together. A row whose
 * parent is not on the board (removed, without a record, or stopped too long ago) sits at the
 * top, and so does a row in a loop of hand-edited records.
 *
 * ponytail: placing recurses: a parent chain thousands deep would overflow the stack.
 */
export function sessionTree(rows: readonly SessionRow[]): TreeRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parentOf = (r: SessionRow): string | undefined => {
    const parent = r.managed ? r.parentNow : undefined;
    return parent && parent !== r.id && byId.has(parent) ? parent : undefined;
  };
  const kids = new Map<string, SessionRow[]>();
  const tops: SessionRow[] = [];
  for (const row of rows) {
    const parent = parentOf(row);
    if (!parent) tops.push(row);
    else if (kids.has(parent)) kids.get(parent)?.push(row);
    else kids.set(parent, [row]);
  }
  // The highest attention in each row's subtree, each subtree counted once.
  const peak = new Map<string, number>();
  const peakOf = (row: SessionRow): number => {
    const known = peak.get(row.id);
    if (known !== undefined) return known;
    peak.set(row.id, row.attention);
    const top = Math.max(row.attention, ...(kids.get(row.id) ?? []).map(peakOf));
    peak.set(row.id, top);
    return top;
  };
  const ranked = (group: readonly SessionRow[]) => [...group].sort((a, b) => peakOf(b) - peakOf(a));
  const out: TreeRow[] = [];
  const placed = new Set<string>();
  const place = (row: SessionRow, depth: number) => {
    if (placed.has(row.id)) return;
    placed.add(row.id);
    out.push({ ...row, depth });
    for (const child of ranked(kids.get(row.id) ?? [])) place(child, depth + 1);
  };
  for (const row of ranked(tops)) place(row, 0);
  // Rows in a loop have a parent on the board but no way down from the top: they go at the top.
  for (const row of rows) place(row, 0);
  return out;
}
