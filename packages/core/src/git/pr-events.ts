import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import { type GhState, ghState } from './gh.js';
import { listPullRequests, matchBranches, type PullRequest } from './pull-requests.js';

// PR events (CONTEXT.md, PR event): what happened on the open pull request of a session's
// branch since the session started, that Mesa has not forwarded into it yet. Read with `gh`
// only; a missing or logged-out gh is a state, and finds nothing.

export type PrEventKind = 'check-failed' | 'check-fixed' | 'review' | 'comment' | 'review-comment';

export type PrEvent = {
  /** `<session>:<kind>:<pr number>:<what>`, the key the delivered ledger keeps. */
  id: string;
  session: string;
  project: string;
  kind: PrEventKind;
  at: string;
  pr: { number: number; title: string; url: string };
  /** A check's name, for a check event. */
  check?: string;
  /** Who reviewed or commented. */
  author?: string;
  /** A review's state: APPROVED, CHANGES_REQUESTED, COMMENTED, or DISMISSED. */
  state?: string;
  /** The file an inline review comment is on. */
  path?: string;
  /** The item's own link when GitHub gives one, else the pull request's. */
  url: string;
  /** The first words of a review's or comment's text, on one line. */
  excerpt?: string;
};

/** A live session on a branch, whose pull request is watched. */
export type PrWatch = {
  session: string;
  project: string;
  branch: string;
  /** A checkout of its repository, where gh runs. */
  cwd: string;
  /** Events before this (the session's start) are not news to it. */
  since: string;
};

export type PrProblem = {
  project: string;
  pr?: number;
  reason: 'failed' | 'timeout' | 'invalid-data';
};

export type PrScan = { gh: GhState; events: PrEvent[]; problems: PrProblem[] };

/** What was delivered: event ids, and the checks a delivered failure left failing. */
export type PrDelivered = { delivered: ReadonlySet<string>; failing: ReadonlySet<string> };

/** The key of one check of one pull request, as a session was told it failed. */
export const failingKey = (event: Pick<PrEvent, 'session' | 'pr' | 'check'>) =>
  `${event.session}:${event.pr.number}:${event.check ?? ''}`;

const Author = z.object({ login: z.string() }).nullable().optional();
const Rollup = z.array(
  z.union([
    z.object({
      __typename: z.literal('CheckRun'),
      name: z.string(),
      workflowName: z.string().nullable().optional(),
      conclusion: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      detailsUrl: z.string().nullable().optional(),
    }),
    z.object({
      __typename: z.literal('StatusContext'),
      context: z.string(),
      state: z.string(),
      startedAt: z.string().nullable().optional(),
      targetUrl: z.string().nullable().optional(),
    }),
  ]),
);
const Activity = z.object({
  statusCheckRollup: Rollup.nullable().optional(),
  reviews: z
    .array(
      z.object({
        id: z.string(),
        author: Author,
        state: z.string(),
        body: z.string().default(''),
        submittedAt: z.string().nullable().optional(),
      }),
    )
    .default([]),
  comments: z
    .array(
      z.object({
        id: z.string(),
        author: Author,
        body: z.string().default(''),
        createdAt: z.string(),
        url: z.string().optional(),
      }),
    )
    .default([]),
});
const ReviewComments = z.array(
  z.object({
    id: z.number(),
    user: z.object({ login: z.string() }).nullable().optional(),
    body: z.string().default(''),
    path: z.string().optional(),
    created_at: z.string(),
    html_url: z.string().optional(),
  }),
);
type Activity = z.infer<typeof Activity> & { reviewComments: z.infer<typeof ReviewComments> };

/** Check conclusions that mean a failure; CANCELLED is left out, since a newer push cancels. */
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

/** Up to 160 characters of `text` on one line. */
const excerptOf = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
};

/** gh's JSON from one call in `cwd`, parsed by `schema`, or why not. */
async function ghJson<T>(
  run: Runner,
  cwd: string,
  args: string[],
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; reason: PrProblem['reason'] }> {
  const said = await run('gh', args, 30_000, { cwd });
  if (!said.ok) return { ok: false, reason: said.reason === 'missing' ? 'failed' : said.reason };
  try {
    const parsed = schema.safeParse(JSON.parse(said.stdout));
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: 'invalid-data' };
  } catch {
    return { ok: false, reason: 'invalid-data' };
  }
}

/** One pull request's checks, reviews, and comments, and its inline review comments, newest 100. */
async function readActivity(
  run: Runner,
  cwd: string,
  pr: number,
): Promise<{ ok: true; data: Activity } | { ok: false; reason: PrProblem['reason'] }> {
  const view = await ghJson(
    run,
    cwd,
    ['pr', 'view', String(pr), '--json', 'statusCheckRollup,reviews,comments'],
    Activity,
  );
  if (!view.ok) return view;
  const inline = await ghJson(
    run,
    cwd,
    ['api', `repos/{owner}/{repo}/pulls/${pr}/comments?sort=created&direction=desc&per_page=100`],
    ReviewComments,
  );
  if (!inline.ok) return inline;
  return { ok: true, data: { ...view.data, reviewComments: inline.data } };
}

/** The events on `pr` that `watch` has not been told of. */
function eventsFor(
  watch: PrWatch,
  pr: PullRequest,
  activity: Activity,
  told: PrDelivered,
): PrEvent[] {
  const since = Date.parse(watch.since);
  const fresh = (at: string | null | undefined): at is string =>
    typeof at === 'string' && Date.parse(at) >= since;
  const base = {
    session: watch.session,
    project: watch.project,
    pr: { number: pr.number, title: pr.title, url: pr.url },
  };
  const id = (kind: PrEventKind, what: string) => `${watch.session}:${kind}:${pr.number}:${what}`;
  const events: PrEvent[] = [];
  for (const check of activity.statusCheckRollup ?? []) {
    const run =
      check.__typename === 'CheckRun'
        ? {
            name: check.workflowName ? `${check.workflowName} / ${check.name}` : check.name,
            outcome: check.conclusion ?? '',
            at: check.completedAt,
            url: check.detailsUrl,
          }
        : { name: check.context, outcome: check.state, at: check.startedAt, url: check.targetUrl };
    if (!run.at) continue;
    const event = { ...base, check: run.name, at: run.at, url: run.url || pr.url };
    if (FAILED.has(run.outcome) && fresh(run.at)) {
      events.push({
        ...event,
        kind: 'check-failed',
        id: id('check-failed', `${run.name}:${run.at}`),
      });
    } else if (run.outcome === 'SUCCESS' && told.failing.has(failingKey(event))) {
      events.push({
        ...event,
        kind: 'check-fixed',
        id: id('check-fixed', `${run.name}:${run.at}`),
      });
    }
  }
  for (const review of activity.reviews) {
    // A pending review, a draft only its author sees, has no submittedAt.
    if (!fresh(review.submittedAt)) continue;
    events.push({
      ...base,
      kind: 'review',
      id: id('review', review.id),
      at: review.submittedAt,
      state: review.state,
      url: pr.url,
      ...(review.author ? { author: review.author.login } : {}),
      ...(review.body.trim() ? { excerpt: excerptOf(review.body) } : {}),
    });
  }
  for (const comment of activity.comments) {
    if (!fresh(comment.createdAt)) continue;
    events.push({
      ...base,
      kind: 'comment',
      id: id('comment', comment.id),
      at: comment.createdAt,
      url: comment.url || pr.url,
      ...(comment.author ? { author: comment.author.login } : {}),
      excerpt: excerptOf(comment.body),
    });
  }
  for (const comment of activity.reviewComments) {
    if (!fresh(comment.created_at)) continue;
    events.push({
      ...base,
      kind: 'review-comment',
      id: id('review-comment', String(comment.id)),
      at: comment.created_at,
      url: comment.html_url || pr.url,
      ...(comment.user ? { author: comment.user.login } : {}),
      ...(comment.path ? { path: comment.path } : {}),
      excerpt: excerptOf(comment.body),
    });
  }
  return events.filter((event) => !told.delivered.has(event.id));
}

/**
 * The PR events each watched session has not been told of, oldest first: failed checks, checks
 * fixed after a failure it was told of, reviews (state and author), and review and issue
 * comments, from the open pull request of its branch. One `gh pr list` per project, then one
 * `gh pr view` and one `gh api` per matched pull request; a call that fails is a problem of its
 * project or pull request, and the others still report.
 */
export async function scanPrEvents(
  run: Runner,
  watches: readonly PrWatch[],
  told: PrDelivered,
): Promise<PrScan> {
  const gh = await ghState(run);
  const events: PrEvent[] = [];
  const problems: PrProblem[] = [];
  if (gh.state !== 'ready') return { gh, events, problems };
  const projects = new Map<string, PrWatch[]>();
  for (const watch of watches)
    projects.set(watch.project, [...(projects.get(watch.project) ?? []), watch]);
  for (const [project, group] of projects) {
    const cwd = group[0]?.cwd;
    if (!cwd) continue;
    const listed = await listPullRequests(run, cwd);
    if (!listed.ok) {
      problems.push({ project, reason: listed.reason });
      continue;
    }
    const branches = new Map<string, string[]>();
    for (const watch of group)
      branches.set(watch.branch, [...(branches.get(watch.branch) ?? []), watch.session]);
    const open = listed.pullRequests.filter((pr) => pr.state === 'OPEN');
    for (const { pr, sessionIds } of matchBranches(open, branches)) {
      const activity = await readActivity(run, cwd, pr.number);
      if (!activity.ok) {
        problems.push({ project, pr: pr.number, reason: activity.reason });
        continue;
      }
      for (const watch of group.filter((w) => sessionIds.includes(w.session)))
        events.push(...eventsFor(watch, pr, activity.data, told));
    }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { gh, events, problems };
}
