import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/window/caller.js';
import { githubPullLink } from '../sources/github.js';
import { failure, unwrap } from './cli-read.js';
import { type MergeMethod, mergeGithub, mergeStateGithub } from './github-merge.js';
import type { Reached } from './review.js';

/** A pull request named by its registered project and number, or by its GitHub URL. */
export type PrTarget = { project: string; number: number } | { url: string };

/** Who asked for a merge outside a session's window, as its receipt names them. */
export const MERGE_CALLERS = ['cli', 'app', 'phone'] as const;
export type MergeCaller = (typeof MERGE_CALLERS)[number];

/** Why a merge is refused until the caller confirms it. */
export type MergeRefusal = 'conflicting' | 'checks-failing';

/**
 * Merges a pull request through `gh pr merge` (mesa prs merge, #1071): GitHub only, never
 * `--admin`. A review session may never merge (ADR-0024): it reads untrusted PR text. A closed or
 * merged PR is refused; one that conflicts with its base or has a failing check, required or not,
 * is refused unless the caller confirms. The receipt names the PR, the method and the caller: the
 * Caller's session, else the surface that asked.
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
    opts: { method?: MergeMethod; confirm?: boolean; caller?: MergeCaller } = {},
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
    const refused: MergeRefusal | undefined =
      state.mergeable === 'conflicting'
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
    return ctx.record(
      {
        kind: 'merge',
        summary: () => `Merged ${name} (${method})`,
        failure: `Could not merge ${name}`,
        inputs: { project, number, method, caller, ...(refused ? { confirmed: refused } : {}) },
        outputs: () => ({ provider: at.provider, repo: at.repo, head: state.head }),
        project: () => project,
      },
      async () => {
        const merged = await mergeGithub(ctx.run, at.repo, number, method, state.head);
        if (!merged.ok) throw new MesaError('internal', failure(at.cli, merged));
        return { project, number, method, head: state.head, checks: state.checks };
      },
    );
  };
}
