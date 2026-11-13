import type { PhonePushes } from '@mesa/core/phone';
import { startTransition, useActionState, useOptimistic } from 'react';
import { useMac } from '../mac/useMac';

type Saved = { pushes: PhonePushes; error?: string };

/**
 * The Mac's push settings from `initial`, and `change`, which shows a change at once and saves it
 * on the Mac (`mesa config set phone.<key>`); a refused one goes back, saying why.
 */
export function useSetPushes(initial: PhonePushes) {
  const link = useMac();
  const [saved, save] = useActionState(
    (last: Saved, change: Partial<PhonePushes>): Promise<Saved> =>
      link.call({ method: 'pushes', set: change }).then(
        (pushes) => ({ pushes }),
        (error: Error) => ({ pushes: last.pushes, error: error.message }),
      ),
    { pushes: initial },
  );
  const [pushes, show] = useOptimistic(saved.pushes, (current, change: Partial<PhonePushes>) => ({
    ...current,
    ...change,
  }));
  const change = (next: Partial<PhonePushes>) =>
    startTransition(() => {
      show(next);
      save(next);
    });
  return { pushes, change, error: saved.error };
}
