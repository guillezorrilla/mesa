import type { MesaContext } from '../context.js';
import { readGitDiff } from './diff.js';
import { readGitStatus } from './status.js';

/** The registered project's selected checkout is the owner of Git reads and actions. */
export function gitService(ctx: MesaContext) {
  return {
    status: (project: string, checkout?: string) =>
      readGitStatus(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout)),
    diff: (project: string, input: { checkout?: string; path?: string; staged?: boolean } = {}) =>
      readGitDiff(
        ctx.open(),
        ctx.deps.run,
        project,
        input.checkout && ctx.absolute(input.checkout),
        input.path,
        input.staged,
      ),
  };
}
