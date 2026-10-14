import { gitWorktrees } from '../git/checkout.js';
import { gitCommand } from '../git/command.js';
import { commitOid } from '../git/ref.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { isOver } from '../sessions/record/lifecycle.js';
import type { SessionRecord, SessionReview } from '../sessions/record/record.js';
import type { OpenFlags } from '../sessions/start/open-input.js';
import type { PrProvider } from './provider.js';

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
  provider: PrProvider;
  /** A Bitbucket pull request's source branch, from its read; GitHub's head is pull/<n>/head. */
  sourceBranch?: string;
  /** Post the findings (Post now), else leave them as drafts. */
  post: boolean;
  /** The project's agent: only Claude may post. */
  agent: string;
  /** The session's first prompt for this round (review-prompt.ts). */
  goal: (round: number, head: string) => string | Promise<string>;
};

export type ReviewStart =
  | { session: string; existing: true }
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
  const earlier = deps
    .sessions()
    .filter((r) => r.project === project && r.review?.pr === pr)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const live = earlier.filter((r) => !isOver(r)).at(-1);
  if (live) return { session: live.id, existing: true };
  const mode = input.post ? 'post' : 'drafts';
  if (input.post && input.agent !== 'claude')
    throw new MesaError(
      'usage',
      `Post now needs Claude, which publishes through mesa prs publish; ${input.agent} can only leave drafts`,
    );
  const source = headRef(input);
  const branch = reviewBranch(pr);
  // The project's own checkout is listed first: Mesa never moves it.
  const worktree = (await gitWorktrees(deps.run, deps.projectPath))
    .slice(1)
    .find((w) => w.branch === branch);
  if (worktree) await moveWorktree(deps.run, worktree.path, branch, source);
  else
    await must(
      deps.run,
      deps.projectPath,
      ['fetch', 'origin', `+${source}:${branch}`],
      `cannot fetch pull request #${pr}`,
    );
  const head = await commitOid(deps.run, deps.projectPath, branch);
  const round = Math.max(0, ...earlier.map((r) => r.review?.round ?? 0)) + 1;
  const parent = earlier.at(-1)?.id;
  const review = { pr, round, mode, head } as const;
  const { result } = await deps.open(project, {
    agent: input.agent,
    // A worktree an earlier round's session holds is taken over as a checkout (mesa open --checkout).
    ...(worktree ? { checkout: worktree.path } : { branch }),
    goal: await input.goal(round, head),
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

/** The ref on origin a pull request's head is: GitHub's pull/<n>/head, Bitbucket's source branch. */
function headRef(input: ReviewStartInput) {
  if (input.provider === 'github') return `pull/${input.number}/head`;
  const branch = input.sourceBranch?.trim();
  // Read from the provider: never an option, nor a refspec that writes elsewhere.
  if (!branch || branch.startsWith('-') || /[:\s]/.test(branch))
    throw new MesaError(
      'usage',
      `pull request #${input.number} names no source branch Mesa can fetch: ${branch || 'none'}`,
    );
  return branch;
}

/**
 * Moves the worktree on `branch` to `source`'s head on origin: fetched into FETCH_HEAD, then the
 * branch reset there with switch -C, once the worktree has no changes to lose.
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
  await must(
    run,
    path,
    ['switch', '--quiet', '-C', branch, 'FETCH_HEAD'],
    `cannot move ${path} to the new head`,
  );
}

/** A git call that must succeed: its failure is `usage`, `why` then git's reason. */
async function must(run: Runner, cwd: string, args: string[], why: string) {
  const res = await gitCommand(run, cwd, args, FETCH_MS);
  if (!res.ok) throw new MesaError('usage', `${why}: ${res.detail}`);
  return res.stdout;
}
