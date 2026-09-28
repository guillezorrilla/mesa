import type { MesaContext } from '../context.js';
import { changeGitIndex, commitGit } from './changes.js';
import { readGitDiff } from './diff.js';
import { readGitStatus } from './status.js';

/** The registered project's selected checkout is the owner of Git reads and actions. */
export function gitService(ctx: MesaContext) {
  const changeIndex = (
    project: string,
    checkout: string | undefined,
    path: string,
    action: 'stage' | 'unstage',
  ) =>
    ctx.record(
      {
        summary: () => `${action === 'stage' ? 'Staged' : 'Unstaged'} ${path} in ${project}`,
        failure: `Could not ${action} ${path} in ${project}`,
        project: () => project,
        inputs: { project, checkout, path, action },
      },
      () =>
        changeGitIndex(
          ctx.open(),
          ctx.deps.run,
          project,
          checkout && ctx.absolute(checkout),
          path,
          action,
        ),
    );
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
    stage: (project: string, path: string, checkout?: string) =>
      changeIndex(project, checkout, path, 'stage'),
    unstage: (project: string, path: string, checkout?: string) =>
      changeIndex(project, checkout, path, 'unstage'),
    commit: (project: string, message: string, checkout?: string) =>
      ctx.record(
        {
          summary: (result) => `Committed ${result.oid.slice(0, 7)} in ${project}`,
          failure: `Could not commit in ${project}`,
          project: () => project,
          inputs: { project, checkout, summary: message.split('\n', 1)[0] },
          outputs: (result) => ({ oid: result.oid }),
        },
        () =>
          commitGit(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout), message),
      ),
  };
}
