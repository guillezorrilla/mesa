import { useActionState } from 'react';
import { useMac } from '../mac/useMac';

/** Turning rule `name` on or off (`mesa automations enable`/`disable`), as an action. */
export function useSetRule(name: string, onDone: () => void) {
  const link = useMac();
  return useActionState(
    (_last: string | undefined, enabled: boolean): Promise<string | undefined> =>
      link.call({ method: 'rule', name, enabled }).then(
        () => {
          onDone();
          return undefined;
        },
        (error: Error) => error.message,
      ),
    undefined,
  );
}
