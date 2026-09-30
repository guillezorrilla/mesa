import { statSync } from 'node:fs';
import { join } from 'node:path';
import { clip } from '../lib/clip.js';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record.js';
import type { SessionStore } from '../sessions/store.js';
import { sessionSummaryPath } from './layout.js';
import { outOfScope } from './scope.js';

// A project's earlier session goals (CONTEXT.md, Project context): from the session store, not the
// vault, each linked to its summary note when the vault has one. `mesa vault goals`.

/** The most characters of a goal the list keeps. */
const GOAL_CHARS = 300;
export const DEFAULT_GOALS = 20;

export type SessionGoal = {
  id: string;
  agent: SessionRecord['agent'];
  /** ISO times of its start and, once it is over, its end. */
  started: string;
  ended?: string;
  /** Its goal, at most 300 characters; none when it was started without one. */
  goal?: string;
  /** Its summary note, `wiki/sessions/<id>.md`, when the vault has one. */
  summary?: string;
};

/** Whether the vault holds a file at `path`, in its scope. */
const holds = (vault: string, path: string) =>
  !outOfScope(vault, path) &&
  statSync(join(vault, path), { throwIfNoEntry: false })?.isFile() === true;

/**
 * The project's agent sessions (neither plain terminals nor skill runs), ended and archived ones
 * too, newest first, at most `limit` (a positive whole number, else usage), without `exclude`.
 */
export function sessionGoals(
  deps: { store: SessionStore; vault: string },
  project: string,
  { limit = DEFAULT_GOALS, exclude }: { limit?: number; exclude?: string } = {},
): SessionGoal[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new MesaError('usage', `the limit must be a positive whole number, not ${limit}`);
  }
  return deps.store
    .list()
    .filter((r) => r.project === project && r.kind === 'interactive' && r.id !== exclude)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((r) => {
      const summary = sessionSummaryPath(r.id);
      return {
        id: r.id,
        agent: r.agent,
        started: r.startedAt,
        ...(r.endedAt ? { ended: r.endedAt } : {}),
        ...(r.goal === undefined ? {} : { goal: clip(r.goal, GOAL_CHARS) }),
        ...(holds(deps.vault, summary) ? { summary } : {}),
      };
    });
}
