import { MesaError } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record.js';
import { FINAL_STATES } from '../sessions/states.js';
import type { ProjectRow } from './projects.js';
import type { RegistryEntry } from './registry.js';

export const PROJECT_SORTS = ['recent', 'last-session', 'active-sessions', 'most-visited'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

/** Sidebar ordering never rewrites manual registry order or changes project identity. */
export function sortProjects(
  projects: readonly ProjectRow[],
  entries: readonly RegistryEntry[],
  sessions: readonly SessionRecord[],
  sort: string,
): ProjectRow[] {
  if (!PROJECT_SORTS.includes(sort as ProjectSort))
    throw new MesaError('usage', `--sort must be ${PROJECT_SORTS.join(', ')}`);
  const visits = new Map(entries.map((entry) => [entry.name, entry]));
  const activity = new Map<string, { last: number; active: number }>();
  for (const session of sessions) {
    const value = activity.get(session.project) ?? { last: 0, active: 0 };
    value.last = Math.max(value.last, Date.parse(session.startedAt));
    if (
      !session.endedAt &&
      !session.archivedAt &&
      !session.resumedBy &&
      !FINAL_STATES.has(session.lastState.state)
    )
      value.active++;
    activity.set(session.project, value);
  }
  const score = (name: string) => {
    switch (sort) {
      case 'recent':
        return Date.parse(visits.get(name)?.visitedAt ?? '') || 0;
      case 'last-session':
        return activity.get(name)?.last ?? 0;
      case 'active-sessions':
        return activity.get(name)?.active ?? 0;
      default:
        return visits.get(name)?.visits ?? 0;
    }
  };
  return [...projects].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || score(b.name) - score(a.name),
  );
}
