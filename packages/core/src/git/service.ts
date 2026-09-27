import type { MesaContext } from '../context.js';
import { readGitStatus } from './status.js';

/** The registered project's selected checkout is the owner of Git reads and actions. */
export function gitService(ctx: MesaContext) {
  return {
    status: (project: string, checkout?: string) =>
      readGitStatus(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout)),
  };
}
