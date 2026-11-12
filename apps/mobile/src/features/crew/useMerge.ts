import type { PhoneMerge } from '@mesa/core/phone';
import { useActionState } from 'react';
import { useMac } from '../mac/useMac';

export type MergeState = { merge?: PhoneMerge; error?: string };

/** Merging worker `id`'s branch into the session it reports to (`mesa merge`), as an action. */
export function useMerge(id: string) {
  const link = useMac();
  return useActionState(
    (): Promise<MergeState> =>
      link.call({ method: 'merge', id }).then(
        (merge) => ({ merge }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
}
