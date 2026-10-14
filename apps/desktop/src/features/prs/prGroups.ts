import type { PrList, PrRow, PrSetupRow } from '@mesa/core';
import { BUCKET_LABELS, bucketRank } from '@mesa/core/browser';

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
  /** A status heading (By status) rather than a project; it counts its PRs. */
  status?: boolean;
};

const BUCKETS = Object.keys(BUCKET_LABELS) as PrRow['bucket'][];

/**
 * The list's groups, PRs kept in core's order (most urgent, then most recent). By project, each
 * project with a PR, a blocked CLI or a read problem, sorted by its most urgent PR, blocked
 * projects last; by status, the buckets in order, empty ones left out.
 */
export function prGroups(list: PrList, by: PrGrouping): PrGroup[] {
  if (by === 'status')
    return [
      ...BUCKETS.map((bucket) => ({
        key: bucket,
        title: BUCKET_LABELS[bucket],
        prs: list.prs.filter((pr) => pr.bucket === bucket),
        status: true,
      })).filter((group) => group.prs.length > 0),
      // A project that cannot be read has no status: it follows as a project row, with its fix.
      ...list.blocked.map((row) => ({
        key: `blocked:${row.project}`,
        title: row.project,
        ...(row.provider ? { provider: row.provider } : {}),
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
  const urgency = (g: PrGroup) => (g.blocked ? 9 : g.prs[0] ? bucketRank(g.prs[0].bucket) : 8);
  return [...groups.values()].sort(
    (a, b) => urgency(a) - urgency(b) || a.title.localeCompare(b.title),
  );
}
