import type { WorktreeRow } from './inventory.js';

/** A worktree's name: main, else its folder. The app titles its card with it. */
export const worktreeName = (tree: Pick<WorktreeRow, 'main' | 'path'>) =>
  tree.main ? 'main' : (tree.path.split('/').at(-1) ?? tree.path);

/** The branch a worktree has checked out, or `detached`. */
export const branchLabel = (tree: Pick<WorktreeRow, 'branch'>) => tree.branch ?? 'detached';
