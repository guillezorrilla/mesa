import type { WorktreeRow } from '@mesa/core';

/** A worktree's name on its card: main, else its folder. */
export const nameOf = (tree: Pick<WorktreeRow, 'main' | 'path'>) =>
  tree.main ? 'main' : (tree.path.split('/').at(-1) ?? tree.path);
