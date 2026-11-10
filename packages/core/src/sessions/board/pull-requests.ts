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
import { readRegistry } from '../../projects/registry.js';
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
  .record(
    z.string(),
    z.strictObject({
      at: z.string(),
      pullRequests: z.array(Listed),
      /** The list stopped at gh's limit: a branch it misses may have an older pull request. */
      limited: z.literal(true).optional(),
      /** Branches asked one by one (`--head`) since `at`, found or not. */
      asked: z.array(z.string()).optional(),
    }),
  )
  .describe('pull request branches');
type Entry = z.infer<typeof Cache>[string];

/** How long one project's `gh pr list` is reused: the app looks every 2 s, each a new process. */
const FRESH_MS = 60_000;
/** How long an entry is kept at all; a project unregistered goes sooner, at the next write. */
const KEEP_MS = 24 * 60 * 60_000;
/** At most this many branches are asked one by one (`--head`) per look. */
const ASK_AT_ONCE = 5;

const listedOf = (pr: PullRequest) => ({
  number: pr.number,
  state: cardState(pr),
  url: pr.url,
  headRefName: pr.headRefName,
  isCrossRepository: pr.isCrossRepository,
});

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
 * 60 s; a look claims a project in `file` before listing it, so a look meanwhile reuses the last
 * list rather than starting its own. A list cut at gh's limit leaves a branch it misses to
 * `--head`, at most 5 a look, each kept for the list's 60 s. With `gh` missing or logged out,
 * none, kept for the 60 s too; a list that fails keeps the last good one. Each write drops the
 * projects no longer registered and entries over a day old. A project that cannot be read, or any
 * other failure, gives its rows none and the look goes on.
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
    const at = now.toISOString();
    const fresh = (entry: Entry | undefined) =>
      entry !== undefined && now.getTime() - Date.parse(entry.at) < FRESH_MS;
    const registered = () =>
      new Set(readRegistry(deps.profile().paths.registry).map((e) => e.name));
    /** Changes `file` under its lock, pruned; undefined when another process holds it. */
    const save = (change: (current: Record<string, Entry>) => void) => {
      try {
        changeJson(
          deps.file,
          Cache,
          (current = {}) => {
            const names = registered();
            const kept = Object.fromEntries(
              Object.entries(current).filter(
                ([project, entry]) =>
                  names.has(project) && now.getTime() - Date.parse(entry.at) < KEEP_MS,
              ),
            );
            change(kept);
            return kept;
          },
          deps,
        );
        return true;
      } catch {
        return false;
      }
    };
    const pathOf = (project: string) =>
      Promise.resolve().then(() => findProject(deps.profile(), project).path);
    let known = readCache(deps.file, Cache, {});
    const stale = [...branches.keys()].filter((project) => !fresh(known[project]));
    const ready = stale.length > 0 && (await ghState(deps.run)).state === 'ready';
    // Claim first, keeping the last list; a busy file lists anyway, as before claims.
    let mine = stale;
    save((current) => {
      mine = stale.filter((project) => !fresh(current[project]));
      for (const project of mine)
        current[project] = { pullRequests: current[project]?.pullRequests ?? [], at };
      known = { ...current };
    });
    const listed = await Promise.all(
      mine.map(async (project) => {
        // A project that cannot be read (no longer registered) lists none, alone.
        const list = ready
          ? await pathOf(project)
              .then((path) => listPullRequests(deps.run, path))
              .catch(() => undefined)
          : undefined;
        const entry: Entry = list?.ok
          ? {
              at,
              pullRequests: list.pullRequests.map(listedOf),
              ...(list.limited ? { limited: true as const } : {}),
            }
          : // gh not ready: none. A list that failed: the last good one, asked again in 60 s.
            { at, pullRequests: ready ? (known[project]?.pullRequests ?? []) : [] };
        return [project, entry] as const;
      }),
    );
    if (listed.length) {
      known = { ...known, ...Object.fromEntries(listed) };
      save((current) => Object.assign(current, Object.fromEntries(listed)));
    }
    // A list cut at the limit: the branches it misses, asked one by one, claimed the same way.
    const matched = (project: string) =>
      new Set(
        (known[project]?.pullRequests ?? [])
          .filter((pr) => !pr.isCrossRepository)
          .map((pr) => pr.headRefName),
      );
    const missed = [...branches].flatMap(([project, bySession]) => {
      const entry = known[project];
      if (!entry?.limited) return [];
      const has = matched(project);
      return [...bySession.keys()]
        .filter((branch) => !has.has(branch) && !entry.asked?.includes(branch))
        .map((branch) => ({ project, branch }));
    });
    let asks = missed.slice(0, ASK_AT_ONCE);
    if (asks.length && (await ghState(deps.run)).state === 'ready') {
      save((current) => {
        asks = asks.filter(({ project, branch }) => {
          const entry = current[project];
          if (!entry || entry.asked?.includes(branch)) return false;
          entry.asked = [...(entry.asked ?? []), branch];
          return true;
        });
      });
      const found = await Promise.all(
        asks.map(({ project, branch }) =>
          pathOf(project)
            .then((path) => listPullRequests(deps.run, path, branch))
            .then((list) => ({ project, prs: list.ok ? list.pullRequests.map(listedOf) : [] }))
            .catch(() => ({ project, prs: [] })),
        ),
      );
      const add = (target: Record<string, Entry>) => {
        for (const { project, prs } of found) {
          const entry = target[project];
          if (entry) target[project] = { ...entry, pullRequests: [...entry.pullRequests, ...prs] };
        }
      };
      known = { ...known };
      add(known);
      if (found.some(({ prs }) => prs.length)) save(add);
    }
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
