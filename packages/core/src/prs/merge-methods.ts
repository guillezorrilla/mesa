/** How a pull request is merged, as `gh pr merge` names it; squash is Mesa's default. */
export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

/** Each method as people read it, on the PR screen's Merge and the phone's. */
export const MERGE_LABELS: Record<MergeMethod, string> = {
  squash: 'Squash and merge',
  merge: 'Merge commit',
  rebase: 'Rebase and merge',
};
