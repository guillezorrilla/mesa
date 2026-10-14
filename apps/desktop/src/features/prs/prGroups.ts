import type { PrList, PrRow, PrSetupRow } from '@mesa/core';
import { BUCKET_LABELS } from '@mesa/core/browser';

export type PrGrouping = 'project' | 'status';

/** A group of the Reviews list: its title, the PRs in it, and a project's setup or read problem. */
export type PrGroup = {
  key: string;
  title: string;
  /** The project's provider, shown as GH or BB beside a project group's name. */
  provider?: PrRow['provider'];
  prs: PrRow[];
  blocked?: PrSetupRow;
  problem?: string;
};

// Core's buckets, most urgent first: their order is the rank.
const BUCKETS = Object.keys(BUCKET_LABELS) as PrRow['bucket'][];
const rank = (pr: PrRow) => BUCKETS.indexOf(pr.bucket);

/** A PR asks something of me: a review, or a look at what changed since mine. */
export const actionable = (pr: PrRow) => pr.bucket === 'need' || pr.bucket === 'updated';

/** The list for one project: its PRs, setup row, read problem, and whether it is quiet. */
export const projectList = (list: PrList, project: string): PrList => ({
  prs: list.prs.filter((pr) => pr.project === project),
  blocked: list.blocked.filter((row) => row.project === project),
  problems: list.problems.filter((p) => p.project === project),
  quiet: list.quiet.filter((name) => name === project),
});

/**
 * The list's groups. By project, each project with a PR, a blocked CLI or a read problem, sorted
 * by its most urgent PR, blocked projects last; by status, the buckets in order, empty ones left out.
 */
export function prGroups(list: PrList, by: PrGrouping): PrGroup[] {
  if (by === 'status')
    return [
      ...BUCKETS.map((bucket) => ({
        key: bucket,
        title: BUCKET_LABELS[bucket],
        prs: list.prs.filter((pr) => pr.bucket === bucket),
      })).filter((group) => group.prs.length > 0),
      // A project that cannot be read has no status: it follows, by name, with its fix.
      ...list.blocked.map((row) => ({
        key: `blocked:${row.project}`,
        title: row.project,
        prs: [],
        blocked: row,
      })),
      ...list.problems.map((p) => ({
        key: `problem:${p.project}`,
        title: p.project,
        prs: [],
        problem: p.reason,
      })),
    ];
  const groups = new Map<string, PrGroup>();
  const group = (project: string) => {
    const found = groups.get(project) ?? { key: project, title: project, prs: [] };
    groups.set(project, found);
    return found;
  };
  for (const pr of list.prs) {
    const found = group(pr.project);
    found.provider = pr.provider;
    found.prs.push(pr);
  }
  for (const row of list.blocked) {
    const found = group(row.project);
    found.blocked = row;
    if (row.provider) found.provider = row.provider;
  }
  for (const problem of list.problems) group(problem.project).problem = problem.reason;
  const urgency = (g: PrGroup) => (g.blocked ? 9 : Math.min(8, ...g.prs.map(rank)));
  return [...groups.values()]
    .map((g) => ({ ...g, prs: [...g.prs].sort((a, b) => rank(a) - rank(b)) }))
    .sort((a, b) => urgency(a) - urgency(b) || a.title.localeCompare(b.title));
}
