import { MesaError } from '../lib/result.js';
import type { TreeRow } from './board/tree.js';
import { WORKFLOW_STATUSES } from './workflow-status.js';

export const BOARD_VIEWS = ['list', 'stacked', 'cards', 'workflow'] as const;
export const BOARD_GROUPS = ['none', 'project', 'agent'] as const;
export const BOARD_DENSITIES = ['comfortable', 'compact'] as const;
export const BOARD_SORTS = ['attention', 'recent', 'manual'] as const;

export type BoardPreferences = {
  view: (typeof BOARD_VIEWS)[number];
  group: (typeof BOARD_GROUPS)[number];
  density: (typeof BOARD_DENSITIES)[number];
  sort: (typeof BOARD_SORTS)[number];
  order: string[];
};

export const DEFAULT_BOARD_PREFERENCES: BoardPreferences = {
  view: 'list',
  group: 'none',
  density: 'comfortable',
  sort: 'attention',
  order: [],
};

export type PresentationGroup = { key: string; label: string; rows: TreeRow[] };

/** Board grouping and ordering, shared by the CLI and app. Faro's attention order is the default. */
export function presentSessions(
  rows: readonly TreeRow[],
  prefs: BoardPreferences,
): PresentationGroup[] {
  const manual = new Map(prefs.order.map((id, index) => [id, index]));
  const sorted = [...rows].sort((a, b) => {
    if (prefs.sort === 'recent') return b.startedAt.localeCompare(a.startedAt);
    if (prefs.sort === 'manual') {
      const ai = manual.get(a.id) ?? Infinity;
      const bi = manual.get(b.id) ?? Infinity;
      return ai - bi || b.startedAt.localeCompare(a.startedAt);
    }
    return b.attention - a.attention || a.startedAt.localeCompare(b.startedAt);
  });
  // Only the default order carries tree depth: other orders retain links as hints on each row.
  const ordered =
    prefs.sort === 'attention' && prefs.group === 'none' && prefs.view === 'list'
      ? rows.map((row) => ({ ...row }))
      : sorted.map((row) => ({ ...row, depth: 0 }));
  if (prefs.view === 'workflow') {
    return [
      {
        key: 'unassigned',
        label: 'Unassigned',
        rows: ordered.filter((r) => r.managed && !r.workflowStatus),
      },
      ...WORKFLOW_STATUSES.map((status) => ({
        key: status,
        label: status,
        rows: ordered.filter((r) => r.managed && r.workflowStatus === status),
      })),
      { key: 'foreign', label: 'Not managed', rows: ordered.filter((r) => !r.managed) },
    ];
  }
  if (prefs.group === 'none') return [{ key: 'all', label: 'All sessions', rows: ordered }];
  const groups = new Map<string, PresentationGroup>();
  for (const row of ordered) {
    const key = prefs.group === 'project' ? (row.project ?? 'General') : row.agent;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, label: key, rows: [row] });
  }
  return [...groups.values()];
}

/** Move a managed session past its neighbor within its current Board group. */
export function moveBoardSession(
  rows: readonly TreeRow[],
  prefs: BoardPreferences,
  id: string,
  direction: -1 | 1,
): string[] {
  const groups = presentSessions(rows, prefs);
  const group = groups.find((item) => item.rows.some((row) => row.id === id));
  const members = group?.rows.filter((row) => row.managed) ?? [];
  const index = members.findIndex((row) => row.id === id);
  if (index < 0) throw new MesaError('not_found', `no managed session ${id} on Board`);
  const neighbor = members[index + direction];
  const order = groups.flatMap((item) =>
    item.rows.filter((row) => row.managed).map((row) => row.id),
  );
  const visible = new Set(order);
  order.push(...prefs.order.filter((saved) => !visible.has(saved)));
  if (!neighbor) return order;
  const from = order.indexOf(id);
  const to = order.indexOf(neighbor.id);
  [order[from], order[to]] = [order[to] as string, order[from] as string];
  return order;
}
