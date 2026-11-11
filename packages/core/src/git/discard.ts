import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { Checkout } from '../projects/checkout.js';
import { mustGit } from './command.js';
import { literalPath, relativeFilePath } from './path.js';
import { type GitChange, readGitStatus } from './status.js';

/** A file whose changes were thrown away: a tracked one went back to HEAD, an untracked one was deleted. */
export type DiscardedFile = { path: string; oldPath?: string; untracked: boolean };
export type GitDiscard = { checkout: Checkout; discarded: DiscardedFile[] };
/** The named paths, or every change with `all`; `yes` is the confirmation, refused without it. */
export type DiscardTarget = { paths: string[]; all?: boolean; yes?: boolean };

const untracked = (change: GitChange) => change.index === '?';

/** The changes to discard, refusing a path with no change and any conflicted file. */
function discardable(changes: GitChange[], target: DiscardTarget): GitChange[] {
  if (Boolean(target.all) === target.paths.length > 0)
    throw new MesaError('usage', 'name the paths to discard, or pass --all, not both');
  const picked = target.all
    ? changes
    : [...new Set(target.paths.map(relativeFilePath))].map((path) => {
        const change = changes.find((each) => each.path === path);
        if (!change) throw new MesaError('usage', `${path} has no changes to discard`);
        return change;
      });
  if (!picked.length) throw new MesaError('usage', 'no changes to discard');
  const conflicted = picked.filter((change) => change.conflicted).map((change) => change.path);
  if (conflicted.length)
    throw new MesaError(
      'usage',
      `${conflicted.join(', ')} ${conflicted.length > 1 ? 'are' : 'is'} conflicted; resolve the conflict with Resolve with AI (mesa git resolve) instead of discarding it`,
    );
  return picked;
}

/** What a discard would throw away, as the refusal without `yes` names it. */
function wouldDiscard(picked: GitChange[]) {
  const deleted = picked.filter(untracked).map((change) => change.path);
  return `discarding throws away the changes to ${picked.map((change) => change.path).join(', ')}${
    deleted.length ? `; untracked files are deleted: ${deleted.join(', ')}` : ''
  }. Nothing was changed; pass --yes to discard`;
}

/**
 * Throws away changes in a checkout: a tracked file returns to HEAD in both index and work tree,
 * an untracked file is deleted. Nothing changes without `yes`.
 */
export async function discardGitChanges(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  target: DiscardTarget,
): Promise<GitDiscard> {
  const status = await readGitStatus(profile, run, project, selected);
  const picked = discardable(status.changes, target);
  if (!target.yes) throw new MesaError('usage', wouldDiscard(picked));
  const cwd = status.checkout.path;
  const tracked = picked.filter((change) => !untracked(change));
  if (tracked.length) {
    // A rename's source returns too; a file HEAD lacks leaves the index and the work tree.
    const specs = tracked.flatMap((change) =>
      [change.path, change.oldPath].filter((path) => path !== undefined).map(literalPath),
    );
    await mustGit(
      run,
      cwd,
      ['restore', '--staged', '--worktree', '--source=HEAD', '--', ...specs],
      'cannot discard changes',
    );
  }
  const loose = picked.filter(untracked);
  if (loose.length) {
    // `clean` deletes only untracked files matching these literal paths, never ignored ones.
    await mustGit(
      run,
      cwd,
      ['clean', '-f', '--', ...loose.map((change) => literalPath(change.path))],
      'cannot delete untracked files',
    );
  }
  return {
    checkout: status.checkout,
    discarded: picked.map((change) => ({
      path: change.path,
      ...(change.oldPath === undefined ? {} : { oldPath: change.oldPath }),
      untracked: untracked(change),
    })),
  };
}
