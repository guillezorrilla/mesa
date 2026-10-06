import type { Config } from '../profile/config.js';
import type { Profile } from '../profile/profile.js';
import { readProjectFile } from '../projects/project-file.js';
import type { RegistryEntry } from '../projects/registry.js';
import { needsApproval, unapprovedScripts, type WorktreeScript } from '../projects/trust.js';

/**
 * The worktree settings for a project: its mesa.yaml overrides over the profile's. Setup and
 * teardown are left out: they run only through `worktreeScript`, which checks their approval.
 */
export function worktreeSettings(
  profile: Profile,
  project: RegistryEntry,
): Omit<Config['worktrees'], WorktreeScript> {
  const {
    setup: _setup,
    teardown: _teardown,
    ...settings
  } = {
    ...profile.config.worktrees,
    ...readProjectFile(project.path).worktrees,
  };
  return settings;
}

/**
 * The setup or teardown argv a project's worktree runs: its mesa.yaml's, once this profile has
 * approved that exact argv, else the profile's own. An unapproved one is `needs_approval`.
 */
export function worktreeScript(
  profile: Profile,
  project: RegistryEntry,
  script: WorktreeScript,
): string[] {
  const file = readProjectFile(project.path);
  const own = file.worktrees?.[script];
  if (own === undefined) return profile.config.worktrees[script];
  const pending = unapprovedScripts(file, project)[script];
  if (pending) throw needsApproval(project.name, { [script]: pending });
  return own;
}
