import type { ProjectRow, TreeRow } from '@mesa/core';
import { isInternalSession, projectLabel, sessionProjects, sessionTitle } from '@mesa/core/browser';

// Where every session sits in the Office (CONTEXT.md, Office): pure, so its seats are tested
// without a screen.

/** One session at its desk in its own project's room. */
export type Desk = {
  row: TreeRow;
  /** Its family's topmost session on the board, whose colour the whole family wears. */
  family: string;
  /** The session its desk is grouped under in this room: itself, or its ancestor here. */
  pod: string;
  /** Its parent's title, when that parent sits in another room. */
  reportsTo?: string;
};
/** A session also at work in this room's project (Additional project): `home` is its own room. */
export type Visitor = { row: TreeRow; family: string; home: string };
export type Room = { key: string; label: string; desks: Desk[]; visitors: Visitor[] };

const byStart = (a: TreeRow, b: TreeRow) => a.startedAt.localeCompare(b.startedAt);

/**
 * The Office's rooms, one per project with a session in it: registered projects in the registry's
 * order, then the rest by name. A room seats the sessions whose own project it is, oldest first,
 * each followed by its children there, so a seat does not move as attention does; a child whose
 * parent sits elsewhere names it. A session's additional projects each get it as a visitor.
 * Mesa's own plumbing (isInternalSession) takes no desk.
 */
export function officeRooms(rows: readonly TreeRow[], projects: readonly ProjectRow[]): Room[] {
  const shown = rows.filter((row) => !isInternalSession(row)).sort(byStart);
  const byId = new Map(shown.map((row) => [row.id, row]));
  const labels = new Map(projects.map((project) => [project.name, project.label]));
  const label = (key: string) => labels.get(key) ?? projectLabel(key || null);
  const roomOf = (row: TreeRow) => row.project ?? '';
  const parentOf = (row: TreeRow) =>
    row.managed && row.parentNow && row.parentNow !== row.id ? byId.get(row.parentNow) : undefined;
  const familyOf = (row: TreeRow) => {
    const seen = new Set([row.id]);
    let top = row;
    for (let up = parentOf(top); up && !seen.has(up.id); up = parentOf(top)) {
      seen.add(up.id);
      top = up;
    }
    return top.id;
  };
  const rooms = new Map<string, Room>();
  const room = (key: string) => {
    const found = rooms.get(key) ?? { key, label: label(key), desks: [], visitors: [] };
    rooms.set(key, found);
    return found;
  };
  const seated = new Set<string>();
  const seat = (row: TreeRow, pod: string) => {
    if (seated.has(row.id)) return;
    seated.add(row.id);
    const parent = parentOf(row);
    room(roomOf(row)).desks.push({
      row,
      family: familyOf(row),
      pod,
      ...(parent && roomOf(parent) !== roomOf(row) ? { reportsTo: sessionTitle(parent) } : {}),
    });
    for (const child of shown)
      if (parentOf(child) === row && roomOf(child) === roomOf(row)) seat(child, pod);
  };
  for (const row of shown) {
    const parent = parentOf(row);
    if (!parent || roomOf(parent) !== roomOf(row)) seat(row, row.id);
  }
  // A loop of hand-edited records has no top: each still takes a desk.
  for (const row of shown) seat(row, row.id);
  for (const row of shown) {
    if (!row.managed) continue;
    for (const other of sessionProjects(row).slice(1))
      room(other).visitors.push({ row, family: familyOf(row), home: label(roomOf(row)) });
  }
  const order = new Map(projects.map((project, index) => [project.name, index]));
  return [...rooms.values()].sort(
    (a, b) =>
      (order.get(a.key) ?? projects.length) - (order.get(b.key) ?? projects.length) ||
      a.label.localeCompare(b.label),
  );
}

/** A room's desks as its pods: each run of desks grouped under one session, in seat order. */
export function pods(desks: readonly Desk[]): Desk[][] {
  const out: Desk[][] = [];
  for (const desk of desks) {
    const last = out.at(-1);
    if (last?.[0]?.pod === desk.pod) last.push(desk);
    else out.push([desk]);
  }
  return out;
}
