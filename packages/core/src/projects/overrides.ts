import { z } from 'zod';
import { relativeFilePath } from '../git/path.js';

const relativeDirectory = z.string().refine((value) => {
  try {
    relativeFilePath(value);
    return true;
  } catch {
    return false;
  }
}, 'must be a repository-relative directory');

const argv = z.array(z.string().min(1)).max(32);

/**
 * What each worktree setting a project's mesa.yaml may override can hold, with no defaults: the
 * profile config adds its defaults, and a project leaves out what it inherits.
 */
export const WORKTREE_OVERRIDE_FIELDS = {
  base: z.string().min(1),
  fetch: z.boolean(),
  sparseDirectories: z.array(relativeDirectory),
  carryIgnoredDirectories: z.array(relativeDirectory),
  setup: argv,
  teardown: argv,
};

/**
 * The git text recipes a project's mesa.yaml may override (CONTEXT.md, Project override): the
 * instructions a `git-text` run follows, each `{name}` filled by core (git/message.ts).
 */
export const GIT_OVERRIDE_FIELDS = {
  commitMessageRecipe: z.string().trim().min(1),
};
