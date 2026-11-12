import { startTransition, useActionState } from 'react';
import { useMac } from '../mac/useMac';

export type Assigned = { assignee?: string; error?: string };

/** Assigning ticket `id` to the person, as an action: Mesa's one write to its tracker. */
export function useAssign(id: string, site?: string) {
  const link = useMac();
  const [assigned, dispatch, assigning] = useActionState(
    (): Promise<Assigned> =>
      link.call({ method: 'assign', id, ...(site ? { site } : {}) }).then(
        ({ assignee }) => ({ assignee }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
  return { assigned, assign: () => startTransition(dispatch), assigning };
}
