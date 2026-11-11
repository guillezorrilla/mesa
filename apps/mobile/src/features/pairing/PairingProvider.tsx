import { type PhonePairing, pairingClient } from '@mesa/core/phone';
import { type ReactNode, use, useState } from 'react';
import { PairingContext } from './pairingContext';
import { forgetPairing, readPairing, writePairing } from './pairingStore';

// ponytail: read once per launch; the provider owns every change after.
let stored: Promise<PhonePairing | undefined> | undefined;

/** Holds the pairing read from the Keychain (suspends until it is), and saves or forgets it. */
export function PairingProvider({ children }: { children: ReactNode }) {
  stored ??= readPairing();
  const [pairing, setPairing] = useState(use(stored));

  const save = async (next: PhonePairing) => {
    await writePairing(next);
    setPairing(next);
  };
  /** Ends it on the broker when it can be reached; here always, so a lost Mac never keeps it. */
  const forget = async () => {
    if (pairing)
      await pairingClient(fetch, pairing.broker)
        .remove(pairing.pairingId, pairing.phoneToken)
        .catch(() => undefined);
    await forgetPairing();
    setPairing(undefined);
  };

  return <PairingContext value={{ pairing, save, forget }}>{children}</PairingContext>;
}
