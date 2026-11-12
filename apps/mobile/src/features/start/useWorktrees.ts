import type { CallResult } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

export type Worktrees = CallResult<'worktrees'>['worktrees'];

/** `project`'s linked worktrees, as a promise to `use()`; keyed by project where it is used. */
export function useWorktrees(project: string): Promise<Worktrees> {
  const link = useMac();
  const [worktrees] = useState(() =>
    link.call({ method: 'worktrees', project }).then(
      (r) => r.worktrees,
      () => [],
    ),
  );
  return worktrees;
}
