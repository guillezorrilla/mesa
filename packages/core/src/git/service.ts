import type { MesaContext } from '../context.js';
import { changeGitBranch, type GitBranchAction, listGitBranches } from './branches.js';
import { changeGitIndex, commitGit } from './changes.js';
import { readGitDiff } from './diff.js';
import { readGitStatus } from './status.js';

/** The registered project's selected checkout is the owner of Git reads and actions. */
export function gitService(ctx: MesaContext) {
  const branch = (
    project: string,
    checkout: string | undefined,
    name: string,
    action: GitBranchAction['action'],
    base?: string,
  ) =>
    ctx.record(
      {
        summary: () => `${action} branch ${name} in ${project}`,
        failure: `Could not ${action} branch ${name} in ${project}`,
        project: () => project,
        inputs: { project, checkout, name, action, ...(base ? { base } : {}) },
      },
      () =>
        changeGitBranch(
          ctx.open(),
          ctx.deps.run,
          ctx.store,
          project,
          checkout && ctx.absolute(checkout),
          name,
          action,
          base,
        ),
    );
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
    branches: (project: string, checkout?: string) =>
      listGitBranches(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout)),
    branchCreate: (project: string, name: string, checkout?: string, base?: string) =>
      branch(project, checkout, name, 'create', base),
    branchCheckout: (project: string, name: string, checkout?: string) =>
      branch(project, checkout, name, 'checkout'),
    branchDelete: (project: string, name: string, checkout?: string) =>
      branch(project, checkout, name, 'delete'),
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
