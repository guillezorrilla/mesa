import { z } from 'zod';
import { ghState } from '../../git/gh.js';
import {
  branchPullRequests,
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
type Cache = z.infer<typeof Cache>;
type Entry = Cache[string];

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

type Deps = LockDeps & { run: Runner; profile: () => Profile; file: string };

/** How long ago `entry` was listed, at `now`. */
const age = (entry: Entry, now: Date) => now.getTime() - Date.parse(entry.at);

/**
 * Changes `file` under its lock, dropping the projects no longer registered (all kept when the
 * registry cannot be read) and entries over a day old: the cache written, or undefined when the
 * lock is busy.
 */
function saveCache(deps: Deps, now: Date, change: (current: Cache) => void): Cache | undefined {
  let names: Set<string> | undefined;
  try {
    names = new Set(readRegistry(deps.profile().paths.registry).map((entry) => entry.name));
  } catch {
    // Pruned by age alone this time.
  }
  try {
    return changeJson(
      deps.file,
      Cache,
      (current = {}) => {
        const kept = Object.fromEntries(
          Object.entries(current).filter(
            ([project, entry]) => (names?.has(project) ?? true) && age(entry, now) < KEEP_MS,
          ),
        );
        change(kept);
        return kept;
      },
      deps,
    );
  } catch {
    return undefined;
  }
}

/**
 * Claims each of `stale` still stale under the lock, its entry dated `now` and otherwise kept, so
 * a look meanwhile reuses the last list: the projects this look lists, and the cache. A busy lock
 * claims none and lists them all, as before claims.
 */
function claimStale(deps: Deps, now: Date, stale: readonly string[]) {
  const at = now.toISOString();
  const claimed: string[] = [];
  const cache = saveCache(deps, now, (current) => {
    for (const project of stale) {
      const entry = current[project];
      if (entry && age(entry, now) < FRESH_MS) continue;
      claimed.push(project);
      current[project] = { pullRequests: [], ...entry, at, asked: [] };
    }
  });
  return cache ? { mine: claimed, cache } : { mine: [...stale], cache: undefined };
}

/**
 * Asks `gh pr list --head` for `asks`, claimed first in each project's `asked` (a failed ask counts
 * as none until the project is listed again, as a failed list keeps the last one): the pull
 * requests found, by project.
 */
async function askMissed(
  deps: Deps,
  now: Date,
  asks: readonly { project: string; branch: string }[],
  pathOf: (project: string) => Promise<string>,
) {
  const claimed: { project: string; branch: string }[] = [];
  saveCache(deps, now, (current) => {
    for (const ask of asks) {
      const entry = current[ask.project];
      if (!entry || entry.asked?.includes(ask.branch)) continue;
      entry.asked = [...(entry.asked ?? []), ask.branch];
      claimed.push(ask);
    }
  });
  return Promise.all(
    claimed.map(({ project, branch }) =>
      pathOf(project)
        .then((path) => branchPullRequests(deps.run, path, branch))
        .then((list) => ({ project, prs: list.ok ? list.pullRequests.map(listedOf) : [] }))
        .catch(() => ({ project, prs: [] })),
    ),
  );
}

/**
 * Each Mesa session row on a branch with a pull request in its project's repository, with that
 * pull request: the newest, as `gh pr list` orders them, matched by branch name (matchBranches, so
 * never a fork's). One `gh pr list` per project, the projects side by side, kept in `file` for
 * 60 s; a look claims a project in `file` before it asks gh anything, so a look meanwhile reuses
 * the last list rather than starting its own. A list cut at gh's limit leaves a branch it misses
 * to `--head`, at most 5 a look, each answer kept for the list's 60 s. With `gh` missing or logged
 * out, none, kept for the 60 s too; a list that fails keeps the last good one. Each write drops
 * the projects no longer registered and entries over a day old. A project that cannot be read, or
 * any other failure, gives its rows none and the look goes on.
 */
export async function withPullRequests(deps: Deps, rows: SessionRow[]): Promise<SessionRow[]> {
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
    let known = readCache(deps.file, Cache, {});
    const stale = [...branches.keys()].filter(
      (project) => !known[project] || age(known[project], now) >= FRESH_MS,
    );
    const pathOf = (project: string) =>
      Promise.resolve().then(() => findProject(deps.profile(), project).path);
    // Asked once a look, and only once this look has gh work of its own.
    let ready: Promise<boolean> | undefined;
    const ghReady = () => {
      ready ??= ghState(deps.run).then((gh) => gh.state === 'ready');
      return ready;
    };
    if (stale.length) {
      const { mine, cache } = claimStale(deps, now, stale);
      if (cache) known = cache;
      const ok = mine.length > 0 && (await ghReady());
      const listed = await Promise.all(
        mine.map(async (project): Promise<[string, Entry]> => {
          // A project that cannot be read (no longer registered) lists none, alone.
          const list = ok
            ? await pathOf(project)
                .then((path) => listPullRequests(deps.run, path))
                .catch(() => undefined)
            : undefined;
          if (list?.ok)
            return [
              project,
              {
                at,
                pullRequests: list.pullRequests.map(listedOf),
                ...(list.limited ? { limited: true as const } : {}),
              },
            ];
          // gh not ready: none. A list that failed: the last good one, asked again in 60 s.
          return [
            project,
            ok ? { pullRequests: [], ...known[project], at } : { at, pullRequests: [] },
          ];
        }),
      );
      if (listed.length) {
        const lists = Object.fromEntries(listed);
        known = { ...known, ...lists };
        saveCache(deps, now, (current) => Object.assign(current, lists));
      }
    }
    // A list cut at gh's limit: the branches it misses, asked one by one.
    const asks = [...branches]
      .flatMap(([project, bySession]) => {
        const entry = known[project];
        if (!entry?.limited) return [];
        const listed = new Set(entry.pullRequests.map((pr) => pr.headRefName));
        return [...bySession.keys()]
          .filter((branch) => !listed.has(branch) && !entry.asked?.includes(branch))
          .map((branch) => ({ project, branch }));
      })
      .slice(0, ASK_AT_ONCE);
    if (asks.length && (await ghReady())) {
      const found = (await askMissed(deps, now, asks, pathOf)).filter(({ prs }) => prs.length);
      const add = (cache: Cache) => {
        for (const { project, prs } of found) {
          const entry = cache[project];
          if (entry) cache[project] = { ...entry, pullRequests: [...entry.pullRequests, ...prs] };
        }
      };
      known = structuredClone(known);
      add(known);
      if (found.length) saveCache(deps, now, add);
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
