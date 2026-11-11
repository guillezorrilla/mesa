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

/**
 * The changes to discard, one per path, refusing a path with no change and any conflicted file.
 * A path git lists twice (deleted in the index and back as untracked) counts as tracked.
 */
function pickChanges(changes: GitChange[], target: DiscardTarget): GitChange[] {
  if (Boolean(target.all) === target.paths.length > 0)
    throw new MesaError('usage', 'name the paths to discard, or pass --all, not both');
  const byPath = new Map<string, GitChange>();
  for (const change of [...changes].sort((a, b) => Number(untracked(a)) - Number(untracked(b))))
    if (!byPath.has(change.path)) byPath.set(change.path, change);
  const picked = target.all
    ? [...byPath.values()]
    : [...new Set(target.paths.map(relativeFilePath))].map((path) => {
        const change = byPath.get(path);
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
 * an untracked file is deleted. Nothing changes without `yes`, or when any path is refused.
 */
export async function discardGitChanges(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  target: DiscardTarget,
): Promise<GitDiscard> {
  const status = await readGitStatus(profile, run, project, selected);
  const picked = pickChanges(status.changes, target);
  // Every path is checked before git runs, so a refused one (a nested repository's `sub/`) changes nothing.
  // A rename's source returns too; a file HEAD lacks leaves the index and the work tree.
  const restore = picked
    .filter((change) => !untracked(change))
    .flatMap((change) => [change.path, change.oldPath].filter((path) => path !== undefined))
    .map(literalPath);
  const clean = picked.filter(untracked).map((change) => literalPath(change.path));
  if (!target.yes) throw new MesaError('usage', wouldDiscard(picked));
  const cwd = status.checkout.path;
  if (restore.length)
    await mustGit(
      run,
      cwd,
      ['restore', '--staged', '--worktree', '--source=HEAD', '--', ...restore],
      'cannot discard changes',
    );
  // `clean` deletes only untracked files matching these literal paths, never ignored ones.
  if (clean.length)
    await mustGit(run, cwd, ['clean', '-f', '--', ...clean], 'cannot delete untracked files');
  return {
    checkout: status.checkout,
    discarded: picked.map((change) => ({
      path: change.path,
      ...(change.oldPath === undefined ? {} : { oldPath: change.oldPath }),
      untracked: untracked(change),
    })),
  };
}
