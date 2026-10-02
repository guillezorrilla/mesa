import type { Config } from '../profile/config.js';
import type { Profile } from '../profile/profile.js';
import { readProjectFile } from '../projects/project-file.js';

/** The worktree settings for the project in `dir`: its mesa.yaml overrides over the profile's. */
export const worktreeSettings = (profile: Profile, dir: string): Config['worktrees'] => ({
  ...profile.config.worktrees,
  ...readProjectFile(dir).worktrees,
});
