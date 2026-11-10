import { z } from 'zod';
import { relativeFilePath } from '../git/path.js';

const relativePath = z.string().refine((value) => {
  try {
    relativeFilePath(value);
    return true;
  } catch {
    return false;
  }
}, 'must be a repository-relative path');

const argv = z.array(z.string().min(1)).max(32);

/**
 * What each worktree setting a project's mesa.yaml may override can hold, with no defaults: the
 * profile config adds its defaults, and a project leaves out what it inherits.
 */
export const WORKTREE_OVERRIDE_FIELDS = {
  base: z.string().min(1),
  fetch: z.boolean(),
  sparseDirectories: z.array(relativePath),
  // Ignored files and folders a new worktree copies from the checkout (worktrees/carry.ts).
  carry: z.array(relativePath),
  setup: argv,
  teardown: argv,
};

/**
 * The git text recipes a project's mesa.yaml may override (CONTEXT.md, Project override): the
 * instructions a `git-text` run follows, each `{name}` filled by core (git/message.ts).
 */
export const GIT_OVERRIDE_FIELDS = {
  commitMessageRecipe: z.string().trim().min(1),
  pullRequestRecipe: z.string().trim().min(1),
};

/**
 * A `worktrees` block with `carryIgnoredDirectories`, the name `carry` had before it took files,
 * read as `carry` unless it is also set.
 */
export function withCarryRenamed(value: unknown) {
  if (!value || typeof value !== 'object' || !('carryIgnoredDirectories' in value)) return value;
  const { carryIgnoredDirectories, ...rest } = value as Record<string, unknown>;
  return 'carry' in rest ? rest : { ...rest, carry: carryIgnoredDirectories };
}
