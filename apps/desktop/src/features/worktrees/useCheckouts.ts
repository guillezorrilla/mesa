import { useCommand } from '@/lib/useCommand';

/** The project's selectable checkouts, including manual worktrees with no session. */
export function useCheckouts(project: string) {
  const worktrees = useCommand('worktrees.list', { project });
  return worktrees.data?.filter((row) => row.state !== 'stale' && row.state !== 'recycled') ?? [];
}
