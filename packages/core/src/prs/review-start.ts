import { gitWorktrees } from '../git/checkout.js';
import { gitCommand, mustGit } from '../git/command.js';
import { branchName, commitOid } from '../git/ref.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { isOver } from '../sessions/record/lifecycle.js';
import type { SessionRecord, SessionReview } from '../sessions/record/record.js';
import type { OpenFlags } from '../sessions/start/open-input.js';
import { canPost, reviewsOf } from './review-sessions.js';

// Starting a review session on a pull request (mesa prs start): its head fetched into the local
// branch review/<n>, a worktree on that branch made or moved to it, and a session opened there
// with the review on its record. Git runs through the injected runner.

/** What a review session is opened with: sessions.open's flags. */
type ReviewOpen = Pick<
  OpenFlags,
  'agent' | 'branch' | 'checkout' | 'goal' | 'review' | 'parent' | 'noParent'
>;

export type ReviewStartDeps = {
  run: Runner;
  /** The project's own checkout, where its branches and worktrees are. */
  projectPath: string;
  /** Every session record (store.list), ended ones too. */
  sessions: () => readonly SessionRecord[];
  /** Opens the session (sessions.open). */
  open: (project: string, opts: ReviewOpen) => Promise<{ result: SessionRecord }>;
};

export type ReviewStartInput = {
  project: string;
  number: number;
  /** Post the findings (Post now), else leave them as drafts. */
  post: boolean;
  /** The project's agent: only Claude may post (canPost). */
  agent: string;
  /**
   * Reads the pull request once nothing is running: the ref on origin its head is fetched from,
   * and how many Pending drafts of mine it has (Post now would publish them too, so is refused).
   */
  read: () => Promise<{ headRef: string; pendingDrafts: number }>;
  /** The session's first prompt, for its review (round, mode, head) (review-prompt.ts). */
  goal: (review: SessionReview) => string | Promise<string>;
};

export type ReviewStart =
  | { session: string; existing: true; mode: SessionReview['mode'] }
  | {
      session: string;
      round: number;
      mode: SessionReview['mode'];
      worktree: string;
      head: string;
      existing: false;
    };

// ponytail: a large pull request on a slow remote takes a while; 2 minutes, raise it when one takes longer.
const FETCH_MS = 120_000;

/** The local branch a pull request's head is reviewed on. */
export const reviewBranch = (pr: number) => `review/${pr}`;

/**
 * Starts a review session on pull request `number` of `project`, or returns the one still live.
 * Its round is one past the highest of that pull request's review sessions on the project, ended
 * ones too, and the newest of them is its parent. The head is fetched into review/<n>; when a
 * worktree has that branch already, its head is fetched into FETCH_HEAD there and the worktree
 * moved to it, which a worktree with changes refuses rather than lose them. Post now needs Claude.
 */
export async function startReview(
  deps: ReviewStartDeps,
  input: ReviewStartInput,
): Promise<ReviewStart> {
  const { project, number: pr } = input;
  if (!Number.isInteger(pr) || pr < 1)
    throw new MesaError('usage', `${pr} is not a pull request number`);
  const { all: earlier, live } = reviewsOf(deps.sessions(), project, pr, (r) => !isOver(r));
  if (live?.review) return { session: live.id, existing: true, mode: live.review.mode };
  const mode = input.post ? 'post' : 'drafts';
  if (input.post && !canPost(input.agent))
    throw new MesaError(
      'usage',
      `Post now needs Claude, which publishes through mesa prs publish; ${input.agent} can only leave drafts`,
    );
  const { headRef, pendingDrafts } = await input.read();
  if (input.post && pendingDrafts > 0)
    throw new MesaError(
      'usage',
      `you have ${pendingDrafts} pending drafts on #${pr}, which Post now would publish too: submit or discard them first, or choose Leave as drafts`,
    );
  // Read from the provider: git checks it is a branch name, never an option or a refspec.
  const source = await branchName(deps.run, deps.projectPath, headRef).catch(() => {
    throw new MesaError('usage', `pull request #${pr} names no head Mesa can fetch: ${headRef}`);
  });
  const branch = reviewBranch(pr);
  // The project's own checkout is listed first: Mesa never moves it.
  const worktree = (await gitWorktrees(deps.run, deps.projectPath))
    .slice(1)
    .find((w) => w.branch === branch);
  // Only a worktree a review session of this pull request holds is Mesa's to move.
  if (worktree && !earlier.some((r) => r.worktree?.path === worktree.path))
    throw new MesaError(
      'usage',
      `${branch} is checked out at ${worktree.path}, which no review of #${pr} holds: remove that worktree or rename its branch, then start the review again`,
    );
  if (worktree) await moveWorktree(deps.run, worktree.path, branch, source);
  else await fetchBranch(deps.run, deps.projectPath, branch, source, pr);
  const head = await commitOid(deps.run, deps.projectPath, branch);
  const round = Math.max(0, ...earlier.map((r) => r.review?.round ?? 0)) + 1;
  const parent = earlier.at(-1)?.id;
  const review = { pr, round, mode, head } as const;
  const { result } = await deps.open(project, {
    agent: input.agent,
    // A worktree an earlier round's session holds is taken over as a checkout (mesa open --checkout).
    ...(worktree ? { checkout: worktree.path } : { branch }),
    goal: await input.goal(review),
    review,
    ...(parent ? { parent } : { noParent: true }),
  });
  return {
    session: result.id,
    round,
    mode,
    worktree: result.worktree?.path ?? '',
    head,
    existing: false,
  };
}

/**
 * Points the local `branch`, checked out nowhere, at `source`'s head on origin. A branch already
 * there (an earlier round's, its worktree removed) is moved only forward: one with commits the
 * head has not is refused rather than lose them.
 */
async function fetchBranch(run: Runner, cwd: string, branch: string, source: string, pr: number) {
  // No `+`: git makes the branch, or moves one already there only forward.
  const fetched = await gitCommand(run, cwd, ['fetch', 'origin', `${source}:${branch}`], FETCH_MS);
  if (fetched.ok) return;
  throw new MesaError(
    'usage',
    /non-fast-forward|rejected/.test(fetched.detail)
      ? `${branch} has commits that are not in #${pr}'s head: rename or delete that branch, then start the review again`
      : `cannot fetch pull request #${pr}: ${fetched.detail}`,
  );
}

/**
 * Moves the worktree on `branch` to `source`'s head on origin: fetched into FETCH_HEAD, then the
 * branch reset there with switch -C, once the worktree has no changes and no commits to lose.
 */
async function moveWorktree(run: Runner, path: string, branch: string, source: string) {
  const status = await must(
    run,
    path,
    ['status', '--porcelain=v1', '-z'],
    `cannot check the review worktree ${path}`,
  );
  if (status)
    throw new MesaError(
      'usage',
      `the review worktree ${path} has changes: commit or remove them, then start the review again`,
    );
  await must(run, path, ['fetch', 'origin', source], `cannot fetch ${source}`);
  const ahead = await must(run, path, ['rev-list', 'FETCH_HEAD..HEAD'], `cannot compare ${path}`);
  if (ahead.trim())
    throw new MesaError(
      'usage',
      `the review worktree ${path} has commits that are not in the new head: push or remove them, then start the review again`,
    );
  await must(
    run,
    path,
    ['switch', '--quiet', '-C', branch, 'FETCH_HEAD'],
    `cannot move ${path} to the new head`,
  );
}

/** A git call that must succeed (mustGit), given a fetch's time. */
const must = (run: Runner, cwd: string, args: string[], why: string) =>
  mustGit(run, cwd, args, why, FETCH_MS);
