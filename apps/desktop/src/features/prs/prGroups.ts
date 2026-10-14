import type { PrList, PrRow, PrSetupRow } from '@mesa/core';

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

const RANK: Record<PrRow['bucket'], number> = { need: 0, updated: 1, waiting: 2, other: 3 };

/** A PR asks something of me: a review, or a look at what changed since mine. */
export const actionable = (pr: PrRow) => pr.bucket === 'need' || pr.bucket === 'updated';

const STATUS: readonly [PrRow['bucket'], string][] = [
  ['need', 'Needs your review'],
  ['updated', 'Updated since your review'],
  ['waiting', 'Waiting on the author'],
  ['other', 'Not for you'],
];

/**
 * The list's groups. By project, each project with a PR, a blocked CLI or a read problem, sorted
 * by its most urgent PR, blocked projects last; by status, the buckets in order, empty ones left out.
 */
export function prGroups(list: PrList, by: PrGrouping): PrGroup[] {
  if (by === 'status')
    return [
      ...STATUS.map(([bucket, title]) => ({
        key: bucket,
        title,
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
  const urgency = (g: PrGroup) =>
    g.blocked ? 9 : Math.min(8, ...g.prs.map((pr) => RANK[pr.bucket]));
  return [...groups.values()]
    .map((g) => ({ ...g, prs: [...g.prs].sort((a, b) => RANK[a.bucket] - RANK[b.bucket]) }))
    .sort((a, b) => urgency(a) - urgency(b) || a.title.localeCompare(b.title));
}

/** The projects that have nothing for me: every one given, less those with a group. */
export const quietProjects = (projects: readonly string[], groups: readonly PrGroup[]) =>
  projects.filter((name) => !groups.some((g) => g.key === name));
