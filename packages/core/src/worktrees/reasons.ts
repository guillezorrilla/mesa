import type { CheckoutFacts, CleanupFacts, WorktreeAction } from './facts.js';

/** What decides an action on one linked worktree, plus whether a trash's destination is taken. */
export type CheckoutDecision = Pick<
  CheckoutFacts,
  'kind' | 'state' | 'branch' | 'live' | 'holders' | 'changes' | 'ignored' | 'unpublished' | 'base'
> & { destinationTaken: boolean };

/**
 * Why `action` may not run. `blocked` is what no force passes: the worktree's state, a session
 * running in it, and what the action needs. `work` is the local work a remove would lose, which
 * a confirmed force removes anyway.
 */
export function worktreeReasons(
  facts: Pick<CleanupFacts, 'kind' | 'missing' | 'holders' | 'onDisk'> | CheckoutDecision,
  action: WorktreeAction,
): { blocked: string[]; work: string[] } {
  if (facts.kind === 'cleanup')
    return {
      blocked: [
        ...(!facts.missing.length ? ['no missing worktrees to clean'] : []),
        ...(facts.holders.length ? ['a session still references a missing worktree'] : []),
        ...facts.onDisk.map(
          (path) => `${path} is prunable but still on disk; repair or remove it first`,
        ),
      ],
      work: [],
    };
  const { state, branch, live, holders, changes, ignored, unpublished, base } = facts;
  const blocked = [
    ...(state !== 'ready' && state !== 'detached' && !(action === 'remove' && state === 'recycled')
      ? [`worktree is ${state}`]
      : []),
    ...(live.length ? [`session ${live.join(', ')} runs in this worktree; stop it first`] : []),
    ...(action === 'trash' && holders.length > live.length
      ? ['a session still references this worktree']
      : []),
    ...(action === 'recycle' && changes.length
      ? ['worktree has uncommitted changes; commit, stash, or trash it']
      : []),
    ...(action === 'recycle' && !base ? ['no default branch to reset to'] : []),
    // A branch keeps its commits through a recycle; a detached HEAD's would be left to the reflog.
    ...(action === 'recycle' && !branch && unpublished
      ? ['detached HEAD has commits no branch holds; make a branch or trash it']
      : []),
    ...(facts.destinationTaken ? ['recycle destination already exists'] : []),
  ];
  const work =
    action === 'remove'
      ? [
          ...(holders.length > live.length ? ['a session still references this worktree'] : []),
          ...(changes.length ? ['worktree has changed or untracked files'] : []),
          ...(ignored.length ? ['worktree has ignored files'] : []),
          ...(unpublished ? ['branch has unpublished commits or is detached'] : []),
        ]
      : [];
  return { blocked, work };
}
