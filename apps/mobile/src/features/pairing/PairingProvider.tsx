import { type PhonePairing, pairingClient } from '@mesa/core/phone';
import { type ReactNode, use, useState } from 'react';
import { PairingContext } from './pairingContext';
import { pairingStore } from './pairingStore';

// ponytail: read once per launch; the provider owns every change after.
let stored: Promise<PhonePairing[]> | undefined;

/** Holds the pairings read from the Keychain (suspends until they are), and saves or forgets one. */
export function PairingProvider({ children }: { children: ReactNode }) {
  stored ??= pairingStore.read();
  const [pairings, setPairings] = useState(use(stored));

  const save = async (next: PhonePairing) => {
    await pairingStore.add(next);
    setPairings((all) => [...all.filter((p) => p.pairingId !== next.pairingId), next]);
  };
  /** Ends one on the broker when it can be reached; here always, so a lost Mac never keeps it. */
  const forget = async (pairingId: string) => {
    const pairing = pairings.find((p) => p.pairingId === pairingId);
    if (pairing)
      await pairingClient(fetch, pairing.broker)
        .remove(pairing.pairingId, pairing.phoneToken)
        .catch(() => undefined);
    await pairingStore.forget(pairingId);
    setPairings((all) => all.filter((p) => p.pairingId !== pairingId));
  };

  return (
    <PairingContext value={{ pairings, pairing: pairings[0], save, forget }}>
      {children}
    </PairingContext>
  );
}
