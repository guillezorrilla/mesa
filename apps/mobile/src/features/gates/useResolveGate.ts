import { useActionState } from 'react';
import { useMac } from '../mac/useMac';

export type Resolved = { picked?: string; error?: string };

/** Resolving gate `id` with one of its options, as an action: the phone is outside any window. */
export function useResolveGate(id: string) {
  const link = useMac();
  return useActionState(
    (_last: Resolved, option: string): Promise<Resolved> =>
      link.call({ method: 'resolve', id, option }).then(
        () => ({ picked: option }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
}
