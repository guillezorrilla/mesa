import { useState } from 'react';
import { useCommand } from '@/lib/useCommand';

/**
 * A remove dialog's "also delete branch" choice: the profile's `worktrees.deleteBranch` until the
 * person checks or unchecks it.
 */
export function useDeleteBranch() {
  const { data } = useCommand('config.get');
  const [choice, setChoice] = useState<boolean>();
  return [choice ?? data?.worktrees.deleteBranch ?? false, setChoice] as const;
}
