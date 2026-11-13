import { PairingError, type PairingInfo, type PhonePairing, pairingClient } from '@mesa/core/phone';
import { useState, useTransition } from 'react';

/** Statuses that mean the broker holds the pairing no more: the Mac unpaired it. */
const GONE = new Set([401, 404, 410]);

export type MacInfo = PairingInfo | 'unreachable' | 'gone';

const read = (pairing: PhonePairing): Promise<MacInfo> =>
  pairingClient(fetch, pairing.broker)
    .state(pairing.pairingId, pairing.phoneToken)
    .catch((error) =>
      error instanceof PairingError && GONE.has(error.status) ? 'gone' : 'unreachable',
    );

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
