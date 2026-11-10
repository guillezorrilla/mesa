import type { MesaContext } from '../../context.js';
import { type BranchMerge, mergeBranch } from '../../git/merge.js';
import { currentBranch } from '../../git/ref.js';
import { MesaError } from '../../lib/result.js';
import { resolveCheckout } from '../../projects/checkout.js';
import { parentNowOf } from '../record/family.js';
import { inTurn } from '../record/lifecycle.js';
import { recordAgent } from '../record/record.js';
import { workingFolder } from '../signals/readings.js';
import type { SessionDeps } from './deps.js';

/** A worker's branch merged into its parent's checkout, or the files that stopped it. */
export type SessionMerge = BranchMerge & {
  child: string;
  into: string;
  branch: string;
  /** The checkout it merged into. */
  checkout: string;
};

/** Bringing a worker's branch back into the session it reports to (`mesa merge`). */
export function mergeActions(ctx: MesaContext, deps: SessionDeps) {
  const { store } = ctx;
  return {
    /**
     * Merges `child`'s branch into the checkout of `into`, default the session it reports to now
     * (familyOf), with `git merge --no-ff` (mergeBranch), with a receipt. Refused while the child
     * is in its turn (inTurn), when either checkout has uncommitted changes, when the two are one checkout or
     * of different projects, or when the child's checkout has no branch. A conflict is aborted
     * and named: `merged: false` with its files.
     */
    merge: (child: string, into?: string) => {
      const worker = store.get(child);
      return ctx.record(
        {
          kind: 'merge',
          type: 'session',
          summary: (r: SessionMerge) =>
            r.merged
              ? `Merged ${r.branch} from ${child} into ${r.into}`
              : `Merge of ${r.branch} from ${child} into ${r.into} stopped on ${r.conflicts.length} conflicting files`,
          failure: `Could not merge session ${child}`,
          project: () => worker.project,
          session: () => child,
          agent: () => recordAgent(worker),
          inputs: { child, ...(into ? { into } : {}) },
          outputs: (r: SessionMerge) => ({
            into: r.into,
            branch: r.branch,
            merged: r.merged,
            ...(r.merged ? { head: r.head } : { conflicts: r.conflicts }),
          }),
        },
        async (): Promise<SessionMerge> => {
          const target = into ?? parentNowOf(store.readable(), worker);
          if (!target)
            throw new MesaError(
              'usage',
              `session ${child} has no parent to merge into; name one with --into`,
            );
          const from = workingFolder(deps.contextDeps, child);
          const to = workingFolder(deps.contextDeps, target);
          if (inTurn(from.found))
            throw new MesaError(
              'usage',
              `session ${child} is still in its turn (${from.found.lastState.state}); merge it once its turn ends`,
            );
          if (from.project !== to.project)
            throw new MesaError(
              'usage',
              `session ${child} works in ${from.project} and ${target} in ${to.project}; merge within one project`,
            );
          const profile = ctx.open();
          const [source, dest] = await Promise.all([
            resolveCheckout(profile, ctx.run, from.project, from.folder),
            resolveCheckout(profile, ctx.run, to.project, to.folder),
          ]);
          if (source.path === dest.path)
            throw new MesaError(
              'usage',
              `sessions ${child} and ${target} share one checkout; there is nothing to merge`,
            );
          const branch = await currentBranch(ctx.run, source.path);
          if (!branch) throw new MesaError('usage', `session ${child}'s checkout is on no branch`);
          const merged = await mergeBranch(ctx.run, dest.path, source.path, branch);
          return { ...merged, child, into: target, branch, checkout: dest.path };
        },
      );
    },
  };
}
