import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/window/caller.js';
import { githubPullLink } from '../sources/github.js';
import { failure, unwrap } from './cli-read.js';
import {
  autoMergeGithub,
  disableAutoMergeGithub,
  mergeGithub,
  mergeStateGithub,
} from './github-merge.js';
import type { MergeMethod } from './merge-methods.js';
import type { Reached } from './review.js';

/** A pull request named by its registered project and number, or by its GitHub URL. */
export type PrTarget = { project: string; number: number } | { url: string };

/** Who asked for a merge outside a session's window, as its receipt names them. */
export const MERGE_CALLERS = ['cli', 'app', 'phone'] as const;
export type MergeCaller = (typeof MERGE_CALLERS)[number];

/** GitHub auto-merge turned on (GitHub merges once required checks and reviews pass) or off. */
export type AutoMerge = 'on' | 'off';

/** GitHub's refusal when the repo's "Allow auto-merge" setting is off. */
const AUTO_NOT_ALLOWED = /auto.?merge is not allowed/i;

/** Why a merge is refused until the caller confirms it. */
export type MergeRefusal = 'conflicting' | 'checks-failing';

/**
 * Merges a pull request through `gh pr merge` (mesa prs merge, #1071): GitHub only, never
 * `--admin`. A review session may never merge (ADR-0024): it reads untrusted PR text. A closed or
 * merged PR is refused; one that conflicts with its base or has a failing check, required or not,
 * is refused unless the caller confirms. The receipt names the PR, the method and the caller: the
 * Caller's session, else the surface that asked. With `auto` it turns GitHub auto-merge on (the same
 * refusals, as it merges later) or off instead of merging now.
 */
export function mergeAction(
  ctx: MesaContext,
  prs: {
    reach: (project: string) => Promise<Reached>;
    /** The registered project whose origin is this GitHub repo (`owner/name`), if any. */
    projectOf: (repo: string) => Promise<string | undefined>;
  },
) {
  async function targetOf(pr: PrTarget) {
    if ('project' in pr) return pr;
    const url = URL.parse(pr.url.trim());
    const link = url?.hostname === 'github.com' ? githubPullLink(url) : undefined;
    if (!link) throw new MesaError('usage', `${pr.url} is not a GitHub pull request URL`);
    const repo = `${link.owner}/${link.repo}`;
    const project = await prs.projectOf(repo);
    if (!project) throw new MesaError('not_found', `no registered project is ${repo}`);
    return { project, number: link.number };
  }

  return async (
    pr: PrTarget,
    opts: { method?: MergeMethod; confirm?: boolean; caller?: MergeCaller; auto?: AutoMerge } = {},
  ) => {
    const method = opts.method ?? 'squash';
    const session = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
    if (session?.review)
      throw new MesaError('usage', `review session ${session.id} cannot merge; a person merges`);
    const { project, number } = await targetOf(pr);
    const at = await prs.reach(project);
    if (at.provider !== 'github')
      throw new MesaError('usage', `${project} is on Bitbucket; Mesa merges through gh only`);
    const state = unwrap(at.cli, await mergeStateGithub(ctx.run, at.repo, number));
    const name = `${project} #${number}`;
    if (state.state !== 'open') throw new MesaError('usage', `${name} is ${state.state}`);
    // Turning auto-merge off merges nothing, so nothing is refused.
    const refused: MergeRefusal | undefined =
      opts.auto === 'off'
        ? undefined
        : state.mergeable === 'conflicting'
          ? 'conflicting'
          : state.checks === 'failing'
            ? 'checks-failing'
            : undefined;
    if (refused && !opts.confirm)
      throw new MesaError(
        'usage',
        `${name} ${refused === 'conflicting' ? 'conflicts with its base' : 'has failing checks'}; confirm to merge anyway (--yes)`,
        { refused, checks: state.checks, mergeable: state.mergeable },
      );
    const caller = session?.id ?? opts.caller ?? 'cli';
    const auto = opts.auto;
    return ctx.record(
      {
        kind: 'merge',
        summary: () =>
          auto === 'on'
            ? `Turned on auto-merge for ${name} (${method})`
            : auto === 'off'
              ? `Turned off auto-merge for ${name}`
              : `Merged ${name} (${method})`,
        failure: auto ? `Could not turn ${auto} auto-merge for ${name}` : `Could not merge ${name}`,
        inputs: {
          project,
          number,
          method,
          caller,
          ...(auto ? { auto } : {}),
          ...(refused ? { confirmed: refused } : {}),
        },
        outputs: () => ({ provider: at.provider, repo: at.repo, head: state.head }),
        project: () => project,
      },
      async () => {
        const done =
          auto === 'on'
            ? await autoMergeGithub(ctx.run, at.repo, number, method, state.head)
            : auto === 'off'
              ? await disableAutoMergeGithub(ctx.run, at.repo, number)
              : await mergeGithub(ctx.run, at.repo, number, method, state.head);
        if (!done.ok && auto === 'on' && AUTO_NOT_ALLOWED.test(done.detail ?? ''))
          throw new MesaError(
            'usage',
            `${at.repo} does not allow auto-merge; turn on "Allow auto-merge" in its GitHub Settings > General`,
          );
        if (!done.ok) throw new MesaError('internal', failure(at.cli, done));
        const autoMerge: MergeMethod | null = auto === 'on' ? method : null;
        return { project, number, method, head: state.head, checks: state.checks, autoMerge };
      },
    );
  };
}
