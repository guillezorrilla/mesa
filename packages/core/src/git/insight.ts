import type { Clock } from '../lib/clock.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { heldWorktrees } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';
import { listWorktrees } from '../worktrees/inventory.js';
import { gitCommand } from './command.js';
import { ghVersion } from './gh.js';
import { readGitGraph } from './history.js';
import { listPullRequests, matchBranches } from './pull-requests.js';
import { readGitStatus } from './status.js';

export type RepositoryInsight = {
  project: string;
  local: {
    source: 'git';
    observedAt: string;
    checkout: string;
    branch: string | null;
    head: string;
    changedFiles: number;
    worktrees: number;
    recent: { oid: string; subject: string; authoredAt: string }[];
  };
  pullRequests: {
    source: 'gh';
    observedAt: string;
    version?: string;
    availability: 'available' | 'missing' | 'unavailable';
    unavailableReason?: 'failed' | 'timeout' | 'invalid-data';
    searched: boolean;
    limited: boolean;
    matches: {
      number: number;
      title: string;
      url: string;
      state: 'OPEN' | 'CLOSED' | 'MERGED';
      isDraft: boolean;
      branch: string;
      updatedAt: string;
      mergedAt: string | null;
      closedAt: string | null;
      sessionIds: string[];
      linkedBy: 'branch-name';
    }[];
  };
};

/** Explicit read-only refresh: Git facts and branch-name PR matches, never attribution of authorship. */
export async function readRepositoryInsight(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  clock: Clock,
  project: string,
  selected?: string,
): Promise<RepositoryInsight> {
  const status = await readGitStatus(profile, run, project, selected);
  const [head, rows, graph] = await Promise.all([
    gitCommand(run, status.checkout.path, ['rev-parse', 'HEAD']),
    listWorktrees(profile, run, store, project),
    status.branch
      ? readGitGraph(profile, run, project, status.checkout.path, status.branch)
      : Promise.resolve(undefined),
  ]);
  if (!head.ok) throw new MesaError('usage', `cannot read Git HEAD: ${head.detail}`);
  const observedAt = clock().toISOString();
  const branchSessions = new Map<string, string[]>();
  for (const session of store.list()) {
    for (const held of heldWorktrees(session)) {
      if (held.project !== project || !held.worktree.branch) continue;
      const ids = branchSessions.get(held.worktree.branch) ?? [];
      ids.push(session.id);
      branchSessions.set(held.worktree.branch, ids);
    }
  }
  const version = await ghVersion(run);
  const base: RepositoryInsight = {
    project,
    local: {
      source: 'git',
      observedAt,
      checkout: status.checkout.path,
      branch: status.branch,
      head: head.stdout.trim(),
      changedFiles: status.changes.length,
      worktrees: rows.length,
      recent:
        graph?.rows
          .flatMap((row) =>
            row.commit
              ? [
                  {
                    oid: row.commit.oid,
                    subject: row.commit.subject,
                    authoredAt: row.commit.authoredAt,
                  },
                ]
              : [],
          )
          .slice(0, 5) ?? [],
    },
    pullRequests: {
      source: 'gh',
      observedAt,
      availability: version.ok
        ? 'unavailable'
        : version.reason === 'missing'
          ? 'missing'
          : 'unavailable',
      searched: false,
      limited: false,
      matches: [],
      ...(!version.ok && version.reason !== 'missing' ? { unavailableReason: version.reason } : {}),
      ...(version.ok ? { version: version.stdout.split('\n')[0] } : {}),
    },
  };
  if (!version.ok || !branchSessions.size) {
    if (version.ok) base.pullRequests.availability = 'available';
    return base;
  }
  const listed = await listPullRequests(run, status.checkout.path);
  base.pullRequests.searched = true;
  if (!listed.ok) {
    base.pullRequests.unavailableReason = listed.reason;
    return base;
  }
  base.pullRequests.availability = 'available';
  base.pullRequests.observedAt = clock().toISOString();
  base.pullRequests.limited = listed.limited;
  base.pullRequests.matches = matchBranches(listed.pullRequests, branchSessions).map(
    ({ pr, sessionIds }) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      isDraft: pr.isDraft,
      branch: pr.headRefName,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      sessionIds,
      linkedBy: 'branch-name' as const,
    }),
  );
  return base;
}
