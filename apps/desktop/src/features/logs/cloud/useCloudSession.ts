import { GENERAL_PROJECT } from '@mesa/core/browser';
import { useRun } from '@/lib/useCommand';

/** Starts a session from the Logs tab in `project` (General too) with `goal`; its id, or undefined. */
export function useCloudSession() {
  const run = useRun();
  return async (project: string, goal: string) => {
    const session = await run(
      'sessions.open',
      project === GENERAL_PROJECT ? { general: true, goal } : { project, goal },
    );
    return session?.id;
  };
}
