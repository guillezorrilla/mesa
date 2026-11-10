import { z } from 'zod';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { Runner } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import type { SessionRow } from '../sessions/board/rows.js';
import { projectScope } from '../sessions/record/general.js';
import { sessionBranch } from '../sessions/record/labels.js';
import { ghState } from './gh.js';
import { fromThisRepository, listPullRequests, type PullRequest } from './pull-requests.js';

/** A session's pull request as its card shows it. */
export type BranchPullRequest = {
  number: number;
  state: 'open' | 'draft' | 'merged' | 'closed';
  url: string;
};

const Listed = z.strictObject({
  number: z.number(),
  state: z.enum(['open', 'draft', 'merged', 'closed']),
  url: z.string(),
  branch: z.string(),
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
 * pull request (the newest, as `gh pr list` orders them; never a fork's: fromThisRepository). One
 * `gh pr list` per project, kept in `file` for 60 s; with `gh` missing, logged out or failing
 * (kept as none for the 60 s too), or any other failure, rows get none and the look goes on.
 */
export async function withPullRequests(
  deps: LockDeps & { run: Runner; profile: () => Profile; file: string },
  rows: SessionRow[],
): Promise<SessionRow[]> {
  try {
    const branchOf = (row: SessionRow) => (row.managed ? sessionBranch(row) : undefined);
    const projects = [
      ...new Set(
        rows.flatMap((row) => (row.managed && branchOf(row) && projectScope(row.project)) || []),
      ),
    ];
    if (!projects.length) return rows;
    const now = deps.clock();
    const cached = readCache(deps.file, Cache, {});
    const fresh: z.infer<typeof Cache> = {};
    let ready: boolean | undefined;
    for (const project of projects) {
      const kept = cached[project];
      if (kept && now.getTime() - Date.parse(kept.at) < FRESH_MS) continue;
      ready ??= (await ghState(deps.run)).state === 'ready';
      // Kept as none for 60 s too, so a missing or logged-out gh costs one check a minute.
      const listed = ready
        ? await listPullRequests(deps.run, findProject(deps.profile(), project).path)
        : undefined;
      const pullRequests = (listed?.ok ? listed.pullRequests : [])
        .filter(fromThisRepository)
        .map((pr) => ({
          number: pr.number,
          state: cardState(pr),
          url: pr.url,
          branch: pr.headRefName,
        }));
      fresh[project] = { at: now.toISOString(), pullRequests };
    }
    if (Object.keys(fresh).length) {
      try {
        changeJson(deps.file, Cache, (current = {}) => ({ ...current, ...fresh }), deps);
      } catch {
        // Not kept (a busy lock): this look still shows them, the next lists again.
      }
    }
    const known = { ...cached, ...fresh };
    return rows.map((row) => {
      const branch = branchOf(row);
      const listed = branch && row.project ? known[row.project]?.pullRequests : undefined;
      const pr = listed?.find((each) => each.branch === branch);
      return pr && row.managed
        ? { ...row, pr: { number: pr.number, state: pr.state, url: pr.url } }
        : row;
    });
  } catch {
    // A pull request is never worth failing the board over.
    return rows;
  }
}
