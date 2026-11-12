import type { CallResult, PhoneCall } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

export type VaultRead<M extends PhoneCall['method']> = { result?: CallResult<M>; error?: string };

/** One read of the vault on the Mac, asked once when the screen opens, as a promise to `use()`. */
export function useVaultRead<M extends PhoneCall['method']>(
  call: Extract<PhoneCall, { method: M }>,
) {
  const link = useMac();
  const [read] = useState(
    (): Promise<VaultRead<M>> =>
      link.call(call).then(
        (result) => ({ result }),
        (error: Error) => ({ error: error.message }),
      ),
  );
  return read;
}
