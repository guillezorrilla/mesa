import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { worktreeSettings } from './settings.js';

/**
 * The ref a project's worktrees measure against and recycle to: origin's default branch, else the
 * configured base, else the branch the main checkout `root` is on.
 */
export async function defaultBranchRef(
  profile: Profile,
  run: Runner,
  root: string,
  project: string,
): Promise<string | undefined> {
  const ask = async (args: string[]) => {
    const result = await gitCommand(run, root, args);
    return result.ok ? result.stdout.trim() || undefined : undefined;
  };
  return (
    (await ask(['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'])) ??
    worktreeSettings(profile, findProject(profile, project)).base ??
    (await ask(['symbolic-ref', '--short', '-q', 'HEAD']))
  );
}
