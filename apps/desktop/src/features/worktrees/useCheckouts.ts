import { useCommand } from '@/lib/useCommand';

/** The project's selectable checkouts, main first, including manual worktrees with no session. */
export function useCheckouts(project: string) {
  const worktrees = useCommand('worktrees.list', { project });
  return (
    worktrees.data?.filter((row) => row.state !== 'stale' && row.state !== 'recycled') ?? []
  ).sort((a, b) => Number(b.main) - Number(a.main));
}
