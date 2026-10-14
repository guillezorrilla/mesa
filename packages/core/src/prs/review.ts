import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { ProjectRow } from '../projects/projects.js';
import { isOver } from '../sessions/record/lifecycle.js';
import { callerOf } from '../sessions/window/caller.js';
import { unwrap } from './cli-read.js';
import type { PrProvider } from './provider.js';
import type { PrProviderApi } from './reader.js';
import { reviewPrompt } from './review-prompt.js';
import { reviewsOf } from './review-sessions.js';
import { type ReviewStartDeps, startReview } from './review-start.js';
import type { PrDetail } from './service.js';

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
  deps: Pick<ReviewStartDeps, 'open'>,
  prs: {
    reach: (project: string) => Promise<Reached>;
    read: (at: Reached, number: number) => Promise<PrDetail>;
  },
) {
  return {
    /**
     * Starts a review session on the PR (mesa prs start), in a worktree at its head; or names the
     * one already running, found from the session records before anything is read.
     */
    start: async (project: string, number: number, opts: { post?: boolean } = {}) => {
      const { live } = reviewsOf(ctx.store.list(), project, number, (r) => !isOver(r));
      if (live?.review)
        return { session: live.id, existing: true as const, mode: live.review.mode };
      const at = await prs.reach(project);
      if (!at.entry.agent) throw new MesaError('usage', `${project} has no agent to review with`);
      let pr: PrDetail | undefined;
      return startReview(
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
          goal: ({ round, mode, head }) => {
            if (!pr) throw new MesaError('internal', `#${number} was not read before its goal`);
            return reviewPrompt({
              ...pr,
              round,
              mode,
              head,
              ...(round > 1 ? { earlier: pr.threads } : {}),
            });
          },
        },
      );
    },

    /**
     * Publishes my Pending drafts on the PR (mesa prs publish): only from a live review session of
     * this PR, in this project, started with Post now; never as an approval (ADR-0024).
     */
    publish: async (project: string, number: number) => {
      const caller = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
      const review = caller?.review;
      if (
        !caller ||
        isOver(caller) ||
        caller.project !== project ||
        review?.pr !== number ||
        review.mode !== 'post'
      )
        throw new MesaError(
          'usage',
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
  };
}
