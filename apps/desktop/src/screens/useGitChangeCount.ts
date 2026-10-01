import { useEffect, useState } from 'react';
import { useCall } from '@/lib/useCommand';

/**
 * How many changes the project's main checkout has, for a badge. Quiet: a folder that is missing
 * or not a Git repository counts as none instead of raising a toast. Bump `revision` to recount.
 */
export function useGitChangeCount(project: string, revision: number) {
  const call = useCall();
  const [count, setCount] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new count is wanted when `revision` bumps.
  useEffect(() => {
    let live = true;
    void call('git.status', { project }).then(
      (result) => live && setCount(result.ok ? result.data.changes.length : 0),
    );
    return () => {
      live = false;
    };
  }, [call, project, revision]);
  return count;
}
