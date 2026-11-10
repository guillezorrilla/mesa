import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { gitCommand, mustGit } from './command.js';

/** What merging a branch into a checkout did: its new head, or the files that conflicted. */
export type BranchMerge = { merged: true; head: string } | { merged: false; conflicts: string[] };

/** Whether the checkout at `cwd` has tracked changes not committed (untracked files aside). */
async function dirty(run: Runner, cwd: string) {
  const status = await mustGit(
    run,
    cwd,
    ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
    `cannot read the checkout at ${cwd}`,
    10_000,
  );
  return status.length > 0;
}

/**
 * Merges `branch` into the checkout at `into` with `git merge --no-ff`, after checking that it and
 * `from`, the checkout `branch` is on, have no uncommitted changes (a usage error when either
 * has). A conflict is aborted (`git merge --abort`), leaving the checkout as it was, and named.
 * A merge git refuses before it starts (an untracked file in the way) is a usage error.
 */
export async function mergeBranch(
  run: Runner,
  into: string,
  from: string,
  branch: string,
): Promise<BranchMerge> {
  for (const [cwd, which] of [
    [into, 'the checkout it merges into'],
    [from, "the worker's checkout"],
  ] as const)
    if (await dirty(run, cwd))
      throw new MesaError('usage', `${which} has uncommitted changes: commit them first (${cwd})`);
  const merged = await gitCommand(run, into, ['merge', '--no-ff', '--no-edit', branch], 120_000);
  if (merged.ok)
    return {
      merged: true,
      head: (await mustGit(run, into, ['rev-parse', 'HEAD'], 'cannot read the merge')).trim(),
    };
  const unmerged = await gitCommand(run, into, ['diff', '--name-only', '-z', '--diff-filter=U']);
  const conflicts = unmerged.ok ? unmerged.stdout.split('\0').filter(Boolean) : [];
  const started = (await gitCommand(run, into, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
  if (!started) throw new MesaError('usage', `cannot merge ${branch}: ${merged.detail}`);
  await mustGit(run, into, ['merge', '--abort'], `cannot abort the merge of ${branch} in ${into}`);
  return { merged: false, conflicts };
}
