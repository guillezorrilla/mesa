import type { SessionRecord } from './record.js';

// The projects a session works in (CONTEXT.md, Additional project; ADR-0021). Pure, with type
// imports only, so the app bundles it and the vault and project readers import it without a cycle.

/**
 * Its own project (the primary), then each additional one: the one rule every reader of which
 * sessions touch a project reads.
 */
export const sessionProjects = (r: Pick<SessionRecord, 'project' | 'additional'>) => [
  r.project,
  ...(r.additional ?? []).map((a) => a.project),
];
