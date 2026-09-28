import { z } from 'zod';
import type { Clock } from '../lib/clock.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { SessionStore } from '../sessions/store.js';
import { listWorktrees } from '../worktrees/inventory.js';
import { gitCommand } from './command.js';
import { readGitGraph } from './history.js';
import { readGitStatus } from './status.js';

const PullRequest = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.url().refine((value) => new URL(value).protocol === 'https:', 'must use HTTPS'),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  headRefName: z.string(),
  updatedAt: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
});

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
    if (session.project !== project || !session.worktree?.branch) continue;
    const ids = branchSessions.get(session.worktree.branch) ?? [];
    ids.push(session.id);
    branchSessions.set(session.worktree.branch, ids);
  }
  const version = await run('gh', ['--version'], 5_000);
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
  const listed = await run(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      '100',
      '--json',
      'number,title,url,state,isDraft,headRefName,updatedAt,mergedAt,closedAt',
    ],
    30_000,
    { cwd: status.checkout.path },
  );
  base.pullRequests.searched = true;
  if (!listed.ok) {
    base.pullRequests.unavailableReason = listed.reason === 'missing' ? 'failed' : listed.reason;
    return base;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(listed.stdout);
  } catch {
    base.pullRequests.unavailableReason = 'invalid-data';
    return base;
  }
  const parsed = z.array(PullRequest).safeParse(raw);
  if (!parsed.success) {
    base.pullRequests.unavailableReason = 'invalid-data';
    return base;
  }
  base.pullRequests.availability = 'available';
  base.pullRequests.observedAt = clock().toISOString();
  base.pullRequests.limited = parsed.data.length === 100;
  base.pullRequests.matches = parsed.data.flatMap((pr) => {
    const sessionIds = branchSessions.get(pr.headRefName);
    return sessionIds
      ? [
          {
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
          },
        ]
      : [];
  });
  return base;
}
