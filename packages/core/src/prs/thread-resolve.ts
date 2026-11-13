import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/window/caller.js';
import { unwrap } from './cli-read.js';
import { resolveGithub, threadPrGithub } from './github-resolve.js';
import type { Reached } from './review.js';

/**
 * Resolves one review thread on a PR, or opens it again (mesa prs resolve, #1064): GitHub only,
 * and only by a person; a review session may not (ADR-0024), as it reads untrusted PR text.
 */
export function resolveAction(ctx: MesaContext, reach: (project: string) => Promise<Reached>) {
  return async (project: string, number: number, thread: string, resolved = true) => {
    const session = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
    if (session?.review)
      throw new MesaError(
        'usage',
        `review session ${session.id} cannot resolve threads; a person does`,
      );
    const at = await reach(project);
    if (at.provider !== 'github')
      throw new MesaError(
        'usage',
        `${project} is on Bitbucket; Mesa resolves threads on GitHub only`,
      );
    const name = `${project} #${number}`;
    // The receipt names this PR, so a thread on any other is refused before a write.
    const on = unwrap(at.cli, await threadPrGithub(ctx.run, thread));
    if (on?.repo.toLowerCase() !== at.repo.toLowerCase() || on.number !== number)
      throw new MesaError('not_found', `${thread} is not a review thread on ${name}`);
    return ctx.record(
      {
        kind: 'connection',
        summary: () => `${resolved ? 'Resolved' : 'Reopened'} a thread on ${name}`,
        failure: `Could not ${resolved ? 'resolve' : 'reopen'} a thread on ${name}`,
        inputs: { project, number, thread, resolved },
        outputs: () => ({ provider: at.provider }),
        project: () => project,
      },
      async () => unwrap(at.cli, await resolveGithub(ctx.run, thread, resolved)),
    );
  };
}
