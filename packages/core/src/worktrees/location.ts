import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { excludeFromGit } from '../git/exclude.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { RegistryEntry } from '../projects/registry.js';

/** One configured root per project and profile; the existing profile path remains the default. */
export function worktreeRoot(profile: Profile, project: RegistryEntry): string {
  const settings = profile.config.worktrees;
  const profileName = basename(profile.paths.root);
  if (settings.location === 'profile') return join(profile.paths.worktrees, project.name);
  if (settings.location === 'sibling')
    return join(dirname(project.path), '.mesa-worktrees', profileName, project.name);
  if (settings.location === 'nested') return join(project.path, '.mesa-worktrees', profileName);
  const custom = settings.customRoot;
  if (!custom) throw new MesaError('invalid_config', 'worktrees.customRoot is required');
  const inside = relative(resolve(project.path), resolve(custom));
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
    throw new MesaError(
      'usage',
      'custom worktree root must be outside the project; use nested location',
    );
  }
  return join(custom, profileName, project.name);
}

/** Nested worktrees are machine-local, not untracked project source. */
export function ignoreNestedWorktrees(profile: Profile, project: RegistryEntry): void {
  if (profile.config.worktrees.location === 'nested')
    excludeFromGit(project.path, ['.mesa-worktrees']);
}
