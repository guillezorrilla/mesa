import { useCommand } from '@/lib/useCommand';

/** Selectable linked checkouts, including manual worktrees with no session. */
export function useCheckoutPaths(project: string) {
  const worktrees = useCommand('worktrees.list', { project });
  return (
    worktrees.data
      ?.filter((row) => !row.main && row.state !== 'stale' && row.state !== 'recycled')
      .map((row) => row.path) ?? []
  );
}
