import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import type { Overrides } from '../decisions/guardrail.js';
import { changeGitBranch, type GitBranchAction, listGitBranches } from './branches.js';
import { changeGitIndex, commitGit } from './changes.js';
import { readGitDiff } from './diff.js';
import { compareGitRefs, readGitGraph } from './history.js';
import { readRepositoryInsight } from './insight.js';
import { changeGitStash, createGitStash, listGitStashes, type StashAction } from './stash.js';
import { readGitStatus } from './status.js';
import { type GitSync, gitTracking, syncGit } from './sync.js';

/** The registered project's selected checkout is the owner of Git reads and actions. */
export function gitService(ctx: MesaContext, faro: Faro) {
  const sync = (
    project: string,
    checkout: string | undefined,
    action: GitSync['action'],
    overrides: Overrides = {},
  ) =>
    ctx.record(
      {
        summary: (result: GitSync) =>
          `${action} ${result.branch} ${action === 'push' ? 'to' : 'from'} ${result.remote}/${result.upstream}`,
        failure: `Could not ${action} ${project}`,
        project: () => project,
        inputs: { project, checkout, action, yes: Boolean(overrides.yes) },
        outputs: (result: GitSync) => ({
          remote: result.remote,
          upstream: result.upstream,
          before: result.before,
          after: result.after,
          ...(result.override ? { override: result.override } : {}),
        }),
      },
      async (decisions) => {
        const target = await gitTracking(
          ctx.open(),
          ctx.deps.run,
          project,
          checkout && ctx.absolute(checkout),
        );
        const override = await faro.guardrail.gate(
          {
            action,
            target: `${target.remote}/${target.upstream}`,
            text: `git ${action} ${target.remote} ${target.upstream}`,
            project,
          },
          overrides,
          decisions,
        );
        return {
          ...(await syncGit(ctx.deps.run, target, action)),
          ...(override ? { override } : {}),
        };
      },
    );
  const stash = (
    project: string,
    checkout: string | undefined,
    ref: string,
    action: StashAction['action'],
  ) =>
    ctx.record(
      {
        summary: () => `${action} stash ${ref} in ${project}`,
        failure: `Could not ${action} stash ${ref} in ${project}`,
        project: () => project,
        inputs: { project, checkout, ref, action },
      },
      () =>
        changeGitStash(
          ctx.open(),
          ctx.deps.run,
          project,
          checkout && ctx.absolute(checkout),
          ref,
          action,
        ),
    );
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
    insight: (project: string, checkout?: string) =>
      readRepositoryInsight(
        ctx.open(),
        ctx.deps.run,
        ctx.store,
        ctx.deps.clock,
        project,
        checkout && ctx.absolute(checkout),
      ),
    graph: (project: string, checkout?: string, branch?: string) =>
      readGitGraph(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout), branch),
    compare: (project: string, base: string, head: string, checkout?: string) =>
      compareGitRefs(
        ctx.open(),
        ctx.deps.run,
        project,
        base,
        head,
        checkout && ctx.absolute(checkout),
      ),
    tracking: (project: string, checkout?: string) =>
      gitTracking(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout)),
    push: (project: string, checkout?: string, overrides?: Overrides) =>
      sync(project, checkout, 'push', overrides),
    pull: (project: string, checkout?: string, overrides?: Overrides) =>
      sync(project, checkout, 'pull', overrides),
    stashes: (project: string, checkout?: string) =>
      listGitStashes(ctx.open(), ctx.deps.run, project, checkout && ctx.absolute(checkout)),
    stashCreate: (project: string, checkout?: string, message?: string) =>
      ctx.record(
        {
          summary: () => `Stashed changes in ${project}`,
          failure: `Could not stash changes in ${project}`,
          project: () => project,
          inputs: { project, checkout, message },
          outputs: (result) => ({ oid: result.oid }),
          changed: (result) => result.created,
        },
        () =>
          createGitStash(
            ctx.open(),
            ctx.deps.run,
            project,
            checkout && ctx.absolute(checkout),
            message,
          ),
      ),
    stashApply: (project: string, ref: string, checkout?: string) =>
      stash(project, checkout, ref, 'apply'),
    stashPop: (project: string, ref: string, checkout?: string) =>
      stash(project, checkout, ref, 'pop'),
    stashDrop: (project: string, ref: string, checkout?: string) =>
      stash(project, checkout, ref, 'drop'),
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
