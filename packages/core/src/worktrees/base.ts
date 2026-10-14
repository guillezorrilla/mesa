import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { worktreeSettings } from './settings.js';

/** A checkout's own default: origin's default branch, else the branch `root` is on. */
export async function checkoutDefault(run: Runner, root: string): Promise<string | undefined> {
  const ask = async (args: string[]) => {
    const result = await gitCommand(run, root, args);
    return result.ok ? result.stdout.trim() || undefined : undefined;
  };
  return (
    (await ask(['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'])) ??
    (await ask(['symbolic-ref', '--short', '-q', 'HEAD']))
  );
}

/**
 * The ref a project's worktrees measure against and recycle to: the configured base, else the
 * main checkout's default (checkoutDefault). The configured base comes first because a clone's
 * `origin/HEAD` is set once at clone time and goes stale.
 */
export async function defaultBranchRef(
  profile: Profile,
  run: Runner,
  root: string,
  project: string,
): Promise<string | undefined> {
  return (
    worktreeSettings(profile, findProject(profile, project)).base ??
    (await checkoutDefault(run, root))
  );
}
