import { type PairingInfo, type PhonePairing, pairingClient } from '@mesa/core/phone';
import { useState, useTransition } from 'react';

const read = (pairing: PhonePairing): Promise<PairingInfo | 'unreachable'> =>
  pairingClient(fetch, pairing.broker)
    .state(pairing.pairingId, pairing.phoneToken)
    .catch(() => 'unreachable' as const);

/**
 * What the broker says about the pairing, as a promise to `use()`, a refresh that re-asks, and
 * whether a refresh is still waiting (the last answer stays on screen meanwhile).
 */
export function useMacInfo(pairing: PhonePairing) {
  const [info, setInfo] = useState(() => read(pairing));
  const [checking, startTransition] = useTransition();
  const refresh = () => startTransition(() => setInfo(read(pairing)));
  return { info, refresh, checking };
}
