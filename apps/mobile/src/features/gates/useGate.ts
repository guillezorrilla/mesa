import type { CallResult } from '@mesa/core/phone';
import { useActionState, useState } from 'react';
import { useMac } from '../mac/useMac';

export type GateRead = { gate?: CallResult<'gate'>; error?: string };
export type Resolved = { picked?: string; error?: string };

/**
 * Open decision gate `id` with the Decision model's advice, as a promise to `use()`, and resolving
 * it with one of its options as an action: a person decides, the phone being outside any window.
 */
export function useGate(id: string) {
  const link = useMac();
  const [read] = useState(
    (): Promise<GateRead> =>
      link.call({ method: 'gate', id }).then(
        (gate) => ({ gate }),
        (error: Error) => ({ error: error.message }),
      ),
  );
  const [resolved, resolve, resolving] = useActionState(
    (_last: Resolved, option: string): Promise<Resolved> =>
      link.call({ method: 'resolve', id, option }).then(
        () => ({ picked: option }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
  return { read, resolved, resolve, resolving };
}
