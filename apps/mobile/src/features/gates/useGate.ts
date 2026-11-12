import type { CallResult } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

export type GateRead = { gate?: CallResult<'gate'>; error?: string };

/** Open decision gate `id` with the Decision model's advice, as a promise to `use()`. */
export function useGate(id: string) {
  const link = useMac();
  const [read] = useState(
    (): Promise<GateRead> =>
      link.call({ method: 'gate', id }).then(
        (gate) => ({ gate }),
        (error: Error) => ({ error: error.message }),
      ),
  );
  return read;
}
