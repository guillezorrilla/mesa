import type { PhoneMerge } from '@mesa/core/phone';
import { useActionState } from 'react';
import { haptic } from '@/lib/haptics';
import { outcomeFeel } from '@/lib/outcomeFeel';
import { useMac } from '../mac/useMac';

export type MergeState = { merge?: PhoneMerge; error?: string };

/** Merging worker `id`'s branch into the session it reports to (`mesa merge`), as an action. */
export function useMerge(id: string) {
  const link = useMac();
  return useActionState(
    (): Promise<MergeState> =>
      link.call({ method: 'merge', id }).then(
        (merge) => {
          haptic(outcomeFeel(merge));
          return { merge };
        },
        (error: Error) => {
          haptic('error');
          return { error: error.message };
        },
      ),
    {},
  );
}
