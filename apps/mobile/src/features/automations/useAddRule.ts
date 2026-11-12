import type { ScheduleRule } from '@mesa/core/phone';
import { router } from 'expo-router';
import { useActionState } from 'react';
import { useMac } from '../mac/useMac';

/** Adding a schedule rule (`mesa automations add`), as an action; back to the list once added. */
export function useAddRule() {
  const link = useMac();
  return useActionState(
    (_last: string | undefined, rule: ScheduleRule): Promise<string | undefined> =>
      link.call({ method: 'addRule', rule }).then(
        () => {
          router.back();
          return undefined;
        },
        (error: Error) => error.message,
      ),
    undefined,
  );
}
