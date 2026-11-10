import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { gitCommand, mustGit } from './command.js';
import { currentBranch } from './ref.js';
import { operationIn } from './status.js';

/** What merging a branch into a checkout did: its new head, or the files that conflicted. */
export type BranchMerge = { merged: true; head: string } | { merged: false; conflicts: string[] };

/** The checkout at `cwd`'s uncommitted changes, as porcelain; untracked files too with `untracked`. */
const changes = (run: Runner, cwd: string, untracked: boolean) =>
  mustGit(
    run,
    cwd,
    ['status', '--porcelain=v1', '-z', `--untracked-files=${untracked ? 'all' : 'no'}`],
    `cannot read the checkout at ${cwd}`,
    10_000,
  );

/**
 * Merges `branch`, checked out at `fromPath`, into the checkout at `intoPath` with `git merge
 * --no-ff`. A usage error, changing nothing, when `intoPath` is on no branch, has tracked changes
 * not committed or a merge, rebase or cherry-pick stopped in it, or `fromPath` has any change not
 * committed (an untracked file would be left behind). A conflict is aborted (`git merge --abort`),
 * leaving the checkout as it was, and named; any other failure is aborted too and a usage error.
 */
export async function mergeBranch(
  run: Runner,
  intoPath: string,
  fromPath: string,
  branch: string,
): Promise<BranchMerge> {
  if (!(await currentBranch(run, intoPath)))
    throw new MesaError('usage', `the checkout it merges into is on no branch (${intoPath})`);
  const operation = await operationIn(run, intoPath);
  if (operation)
    throw new MesaError(
      'usage',
      `a ${operation} is under way in the checkout it merges into: finish or abort it first (${intoPath})`,
    );
  if (await changes(run, intoPath, false))
    throw new MesaError(
      'usage',
      `the checkout it merges into has uncommitted changes: commit them first (${intoPath})`,
    );
  if (await changes(run, fromPath, true))
    throw new MesaError(
      'usage',
      `the worker's checkout has uncommitted changes: commit them first (${fromPath})`,
    );
  const merged = await gitCommand(
    run,
    intoPath,
    ['merge', '--no-ff', '--no-edit', branch],
    120_000,
  );
  if (merged.ok)
    return {
      merged: true,
      head: (await mustGit(run, intoPath, ['rev-parse', 'HEAD'], 'cannot read the merge')).trim(),
    };
  // Nothing under way before it, so a merge under way now is this one's.
  if (!(await operationIn(run, intoPath)))
    throw new MesaError('usage', `cannot merge ${branch}: ${merged.detail}`);
  const unmerged = await gitCommand(run, intoPath, [
    'diff',
    '--name-only',
    '-z',
    '--diff-filter=U',
  ]);
  const conflicts = unmerged.ok ? unmerged.stdout.split('\0').filter(Boolean) : [];
  await mustGit(
    run,
    intoPath,
    ['merge', '--abort'],
    `cannot abort the merge of ${branch} in ${intoPath}`,
  );
  if (!conflicts.length)
    throw new MesaError('usage', `cannot merge ${branch}, the merge was aborted: ${merged.detail}`);
  return { merged: false, conflicts };
}
