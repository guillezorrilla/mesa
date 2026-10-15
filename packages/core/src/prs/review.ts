import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { ProjectRow } from '../projects/projects.js';
import { isOver } from '../sessions/record/lifecycle.js';
import { callerOf } from '../sessions/window/caller.js';
import { unwrap } from './cli-read.js';
import type { PrProvider } from './provider.js';
import type { PrProviderApi } from './reader.js';
import { reviewPrompt } from './review-prompt.js';
import { canPost, reviewsOf, roundInProgress } from './review-sessions.js';
import { type ReviewStartDeps, startReview } from './review-start.js';
import type { PrDetail } from './service.js';
import { type CommentVerdict, prVerdicts, VERDICT_STATES } from './verdicts.js';

/** A project reached through its origin remote (service.ts reach). */
export type Reached = {
  entry: ProjectRow;
  provider: PrProvider;
  repo: string;
  api: PrProviderApi;
  cli: string;
};

/**
 * Review sessions on a pull request (#792): `start` opens one in a worktree at the PR's head, and
 * `publish` posts its drafts when the person chose Post now for it.
 */
export function reviewActions(
  ctx: MesaContext,
  deps: Pick<ReviewStartDeps, 'open' | 'stop'>,
  prs: {
    reach: (project: string) => Promise<Reached>;
    read: (at: Reached, number: number) => Promise<PrDetail>;
  },
) {
  /** What keeps a review session on `agent` from writing to the PR outside `mesa prs`. */
  const guardOf = (agent: string) =>
    canPost(agent) ? ('deny-rules' as const) : ('prompt' as const);

  return {
    /**
     * Starts a review session on the PR (mesa prs start), in a worktree at its head; or names the
     * one already running, found from the session records before anything is read.
     */
    start: async (project: string, number: number, opts: { post?: boolean } = {}) => {
      // One at work is named at once; an idle one waits on the head check in startReview.
      const { live } = reviewsOf(ctx.store.list(), project, number, (r) => !isOver(r));
      if (live?.review && roundInProgress(live.lastState.state))
        return {
          session: live.id,
          existing: true as const,
          mode: live.review.mode,
          guard: guardOf(live.agent),
        };
      const at = await prs.reach(project);
      if (!at.entry.agent) throw new MesaError('usage', `${project} has no agent to review with`);
      let pr: PrDetail | undefined;
      const started = await startReview(
        { run: ctx.run, projectPath: at.entry.path, sessions: () => ctx.store.list(), ...deps },
        {
          project,
          number,
          post: Boolean(opts.post),
          agent: at.entry.agent,
          read: async () => {
            pr = await prs.read(at, number);
            return { headRef: pr.headRef, pendingDrafts: pr.drafts.length };
          },
          goal: ({ round, mode }) => {
            if (!pr) throw new MesaError('internal', `#${number} was not read before its goal`);
            return reviewPrompt({ number, mode, rereview: round > 1 && pr.threads.length > 0 });
          },
        },
      );
      return { ...started, guard: guardOf(at.entry.agent) };
    },

    /**
     * Publishes my Pending drafts on the PR (mesa prs publish): only from a live review session of
     * this PR, in this project, started with Post now; never as an approval (ADR-0024).
     */
    publish: async (project: string, number: number) => {
      const review = reviewCaller(
        ctx,
        project,
        number,
        'post',
        `publishing #${number} needs a live review session of it in ${project} started with Post now; submit drafts on the provider instead`,
      );
      const { provider, repo, api, cli } = await prs.reach(project);
      return ctx.record(
        {
          kind: 'connection',
          summary: (r: { published: number }) =>
            `Published ${r.published} review comments on ${project} #${number}`,
          failure: `Could not publish the review of ${project} #${number}`,
          inputs: { project, number, round: review.round },
          outputs: (r) => ({ provider, published: r.published }),
          project: () => project,
        },
        async () => unwrap(cli, await api.publish(ctx.run, repo, number)),
      );
    },

    /**
     * Records whether an earlier thread of mine was addressed (mesa prs verdict): only from a live
     * review session of this PR, kept by Mesa for that session's round.
     */
    verdict: (
      project: string,
      number: number,
      input: Pick<CommentVerdict, 'thread' | 'state' | 'note' | 'confidence'>,
    ) => {
      const review = reviewCaller(
        ctx,
        project,
        number,
        undefined,
        `a verdict on #${number} comes from a live review session of it in ${project}`,
      );
      if (!VERDICT_STATES.includes(input.state))
        throw new MesaError('usage', `--state is one of ${VERDICT_STATES.join(', ')}`);
      if (input.confidence !== undefined && !(input.confidence >= 0 && input.confidence <= 1))
        throw new MesaError('usage', '--confidence is a number from 0 to 1');
      const verdict = { ...input, round: review.round, at: ctx.clock().toISOString() };
      prVerdicts(ctx.paths.prs, ctx).record(project, number, verdict);
      return verdict;
    },
  };
}

/**
 * The calling session's review when it is a live review of this PR in this project (and, with
 * `mode`, started that way); refused with `why` otherwise. Its window's MESA_SESSION_ID names it.
 */
function reviewCaller(
  ctx: MesaContext,
  project: string,
  number: number,
  mode: 'post' | undefined,
  why: string,
) {
  const caller = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
  const review = caller?.review;
  if (
    !caller ||
    isOver(caller) ||
    caller.project !== project ||
    review?.pr !== number ||
    (mode && review.mode !== mode)
  )
    throw new MesaError('usage', why);
  return review;
}
