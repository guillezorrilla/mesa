import { type PairingInfo, type PhonePairing, pairingClient } from '@mesa/core/phone';
import { startTransition, useState } from 'react';

const read = (pairing: PhonePairing): Promise<PairingInfo | 'unreachable'> =>
  pairingClient(fetch, pairing.broker)
    .state(pairing.pairingId, pairing.phoneToken)
    .catch(() => 'unreachable' as const);

/** What the broker says about the pairing, as a promise to `use()`, and a refresh that re-asks. */
export function useMacInfo(pairing: PhonePairing) {
  const [info, setInfo] = useState(() => read(pairing));
  const refresh = () => startTransition(() => setInfo(read(pairing)));
  return { info, refresh };
}
