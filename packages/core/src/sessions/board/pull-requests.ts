import { z } from 'zod';
import { ghState } from '../../git/gh.js';
import {
  HttpsUrl,
  listPullRequests,
  matchBranches,
  type PullRequest,
} from '../../git/pull-requests.js';
import { changeJson, readCache } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import type { Profile } from '../../profile/profile.js';
import { findProject } from '../../projects/projects.js';
import { projectScope } from '../record/general.js';
import { sessionBranch } from '../record/labels.js';
import type { SessionRow } from './rows.js';

/** A session's pull request as its card shows it. */
export type BranchPullRequest = {
  number: number;
  state: 'open' | 'draft' | 'merged' | 'closed';
  url: string;
};

const Listed = z.strictObject({
  number: z.number(),
  state: z.enum(['open', 'draft', 'merged', 'closed']),
  url: HttpsUrl,
  headRefName: z.string(),
  isCrossRepository: z.boolean(),
});
const Cache = z
  .record(z.string(), z.strictObject({ at: z.string(), pullRequests: z.array(Listed) }))
  .describe('pull request branches');

/** How long one project's `gh pr list` is reused: the app looks every 2 s, each a new process. */
const FRESH_MS = 60_000;

/** A pull request's state as a card colours it: an open draft is `draft`. */
export const cardState = (
  pr: Pick<PullRequest, 'state' | 'isDraft'>,
): BranchPullRequest['state'] =>
  pr.state === 'OPEN'
    ? pr.isDraft
      ? 'draft'
      : 'open'
    : pr.state === 'MERGED'
      ? 'merged'
      : 'closed';

/**
 * Each Mesa session row on a branch with a pull request in its project's repository, with that
 * pull request: the newest, as `gh pr list` orders them, matched by branch name (matchBranches, so
 * never a fork's). One `gh pr list` per project, the projects side by side, kept in `file` for
 * 60 s; with `gh` missing or logged out, none, kept for the 60 s too; a list that fails keeps the
 * last good one. A project that cannot be read, or any other failure, gives its rows none and the
 * look goes on.
 */
export async function withPullRequests(
  deps: LockDeps & { run: Runner; profile: () => Profile; file: string },
  rows: SessionRow[],
): Promise<SessionRow[]> {
  try {
    const branches = new Map<string, Map<string, string[]>>();
    for (const row of rows) {
      const branch = row.managed ? sessionBranch(row) : undefined;
      const project = row.managed ? projectScope(row.project) : undefined;
      if (!branch || !project) continue;
      const own = branches.get(project) ?? branches.set(project, new Map()).get(project);
      own?.set(branch, [...(own.get(branch) ?? []), row.id]);
    }
    if (!branches.size) return rows;
    const now = deps.clock();
    const cached = readCache(deps.file, Cache, {});
    const stale = [...branches.keys()].filter((project) => {
      const kept = cached[project];
      return !kept || now.getTime() - Date.parse(kept.at) >= FRESH_MS;
    });
    const ready = stale.length > 0 && (await ghState(deps.run)).state === 'ready';
    const fresh: z.infer<typeof Cache> = {};
    await Promise.all(
      stale.map(async (project) => {
        // A project that cannot be read (no longer registered) lists none, alone.
        const listed = ready
          ? await Promise.resolve()
              .then(() => listPullRequests(deps.run, findProject(deps.profile(), project).path))
              .catch(() => undefined)
          : undefined;
        const pullRequests = listed?.ok
          ? listed.pullRequests.map((pr) => ({
              number: pr.number,
              state: cardState(pr),
              url: pr.url,
              headRefName: pr.headRefName,
              isCrossRepository: pr.isCrossRepository,
            }))
          : // gh not ready: none. A list that failed: the last good one, asked again in 60 s.
            ready
            ? (cached[project]?.pullRequests ?? [])
            : [];
        fresh[project] = { at: now.toISOString(), pullRequests };
      }),
    );
    if (Object.keys(fresh).length) {
      try {
        changeJson(deps.file, Cache, (current = {}) => ({ ...current, ...fresh }), deps);
      } catch {
        // Not kept (a busy lock): this look still shows them, the next lists again.
      }
    }
    const known = { ...cached, ...fresh };
    const prOf = new Map<string, BranchPullRequest>();
    for (const [project, bySession] of branches) {
      // Newest first, as gh lists them: a session's first match is its newest pull request.
      for (const { pr, sessionIds } of matchBranches(known[project]?.pullRequests ?? [], bySession))
        for (const id of sessionIds)
          if (!prOf.has(id)) prOf.set(id, { number: pr.number, state: pr.state, url: pr.url });
    }
    return rows.map((row) => {
      const pr = row.managed ? prOf.get(row.id) : undefined;
      return pr ? { ...row, pr } : row;
    });
  } catch {
    // A pull request is never worth failing the board over.
    return rows;
  }
}
