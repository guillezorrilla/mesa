import { useActionState } from 'react';
import { useMac } from '../mac/useMac';

export type RunActed = { acted?: 'approve' | 'cancel'; error?: string };

/** Approving or cancelling waiting run `id` (`mesa automations approve`/`cancel`), as an action. */
export function useRunAction(id: string, onDone: () => void) {
  const link = useMac();
  return useActionState(
    (_last: RunActed, act: 'approve' | 'cancel'): Promise<RunActed> =>
      link.call({ method: 'run', id, act }).then(
        () => {
          onDone();
          return { acted: act };
        },
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
}
