import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import { type GhState, ghState } from './gh.js';
import { HttpsUrl, listPullRequests, matchBranches, type PullRequest } from './pull-requests.js';

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
  /**
   * For a review or comment: whether its author is trusted (the repository's owner, a member, a
   * collaborator, or the CI bot). Only a trusted author's text is forwarded.
   */
  trusted?: boolean;
  /** The first words of a trusted author's review or comment, on one line, controls removed. */
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

export type PrScan = {
  gh: GhState;
  events: PrEvent[];
  problems: PrProblem[];
  /**
   * The pull requests read in full, for the ledger to drop failing checks that are gone: each
   * session's open one with the checks it has now, and a closed or merged one with none.
   */
  checked: { session: string; pr: number; checks: string[] }[];
};

/** What was delivered: event ids, and the checks a delivered failure left failing. */
export type PrDelivered = { delivered: ReadonlySet<string>; failing: ReadonlySet<string> };

/** The key of one check of one pull request, as a session was told it failed. */
export const failingKey = (event: { session: string; pr: { number: number }; check?: string }) =>
  `${event.session}:${event.pr.number}:${event.check ?? ''}`;

const Author = z.object({ login: z.string() }).nullable().optional();
/** gh prints these with every review and comment; the REST review comments as author_association. */
const Association = z.string().optional();
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
        authorAssociation: Association,
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
        authorAssociation: Association,
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
    author_association: Association,
    body: z.string().default(''),
    path: z.string().optional(),
    created_at: z.string(),
    html_url: z.string().optional(),
  }),
);
type Activity = z.infer<typeof Activity> & { reviewComments: z.infer<typeof ReviewComments> };

/** Check conclusions that mean a failure; CANCELLED is left out, since a newer push cancels. */
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

/**
 * `text` with no control or format character (ESC, ^C, DEL, a bidi override) and no backtick,
 * so it can neither drive the terminal nor close the fence it is quoted in, on one line.
 */
const clean = (text: string) =>
  text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replaceAll('`', "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Up to 160 characters of `text`, cleaned: an excerpt, a check name, a path, a login. */
const short = (text: string) => {
  const line = clean(text);
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
};

/** `value` when it is an HTTPS link as a pull request's must be, else `fallback`. */
const linkOr = (value: string | null | undefined, fallback: string) =>
  HttpsUrl.safeParse(value).success ? (value as string) : fallback;

/** The associations whose text is forwarded: people who can push to the repository. */
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
/**
 * GitHub Actions' login in each source: GraphQL (`gh pr view`) drops the `[bot]` a REST login
 * keeps, and a person may hold the bare name only where REST shows it, so each is trusted only
 * from its own source.
 */
export const CI_BOT = { graphql: 'github-actions', rest: 'github-actions[bot]' } as const;

/** Who wrote a review or comment, and only a trusted author's text. */
function authored(
  login: string | undefined,
  association: string | undefined,
  body: string,
  bot: string,
) {
  const trusted = login === bot || TRUSTED_ASSOCIATIONS.has(association ?? '');
  const excerpt = trusted ? short(body) : '';
  return {
    ...(login ? { author: short(login) } : {}),
    trusted,
    ...(excerpt ? { excerpt } : {}),
  };
}

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

/** One check run or commit status: its name (as the ledger keys it), outcome, time, and link. */
const checkOf = (check: NonNullable<Activity['statusCheckRollup']>[number]) =>
  check.__typename === 'CheckRun'
    ? {
        name: short(check.workflowName ? `${check.workflowName} / ${check.name}` : check.name),
        outcome: check.conclusion ?? '',
        at: check.completedAt,
        url: check.detailsUrl,
      }
    : {
        name: short(check.context),
        outcome: check.state,
        at: check.startedAt,
        url: check.targetUrl,
      };

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
    const run = checkOf(check);
    if (!run.at) continue;
    const event = { ...base, check: run.name, at: run.at, url: linkOr(run.url, pr.url) };
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
      ...authored(review.author?.login, review.authorAssociation, review.body, CI_BOT.graphql),
    });
  }
  for (const comment of activity.comments) {
    if (!fresh(comment.createdAt)) continue;
    events.push({
      ...base,
      kind: 'comment',
      id: id('comment', comment.id),
      at: comment.createdAt,
      url: linkOr(comment.url, pr.url),
      ...authored(comment.author?.login, comment.authorAssociation, comment.body, CI_BOT.graphql),
    });
  }
  for (const comment of activity.reviewComments) {
    if (!fresh(comment.created_at)) continue;
    events.push({
      ...base,
      kind: 'review-comment',
      id: id('review-comment', String(comment.id)),
      at: comment.created_at,
      url: linkOr(comment.html_url, pr.url),
      ...(comment.path ? { path: short(comment.path) } : {}),
      ...authored(comment.user?.login, comment.author_association, comment.body, CI_BOT.rest),
    });
  }
  return events.filter((event) => !told.delivered.has(event.id));
}

/** The names of the checks on a pull request now. */
const checkNames = (activity: Activity) =>
  (activity.statusCheckRollup ?? []).map((check) => checkOf(check).name);

/**
 * The PR events each watched session has not been told of, oldest first: failed checks, checks
 * fixed after a failure it was told of, reviews (state and author), and review and issue
 * comments, from the open pull request of its branch. A pull request from a fork never matches,
 * whatever its branch is called. One `gh pr list` per project, then one `gh pr view` and one
 * `gh api` per matched open pull request; a call that fails is a problem of its project or pull
 * request, and the others still report.
 */
export async function scanPrEvents(
  run: Runner,
  watches: readonly PrWatch[],
  told: PrDelivered,
): Promise<PrScan> {
  const gh = await ghState(run);
  const events: PrEvent[] = [];
  const problems: PrProblem[] = [];
  const checked: PrScan['checked'] = [];
  if (gh.state !== 'ready') return { gh, events, problems, checked };
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
    for (const { pr, sessionIds } of matchBranches(listed.pullRequests, branches)) {
      if (pr.state !== 'OPEN') {
        for (const session of sessionIds) checked.push({ session, pr: pr.number, checks: [] });
        continue;
      }
      const activity = await readActivity(run, cwd, pr.number);
      if (!activity.ok) {
        problems.push({ project, pr: pr.number, reason: activity.reason });
        continue;
      }
      for (const watch of group.filter((w) => sessionIds.includes(w.session))) {
        events.push(...eventsFor(watch, pr, activity.data, told));
        checked.push({ session: watch.session, pr: pr.number, checks: checkNames(activity.data) });
      }
    }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { gh, events, problems, checked };
}
