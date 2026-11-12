import type { PhonePairing } from '@mesa/core/phone';
import { createContext } from 'react';

/** The phone's pairing, and the two ways it changes. */
export type PairingState = {
  pairing: PhonePairing | undefined;
  save: (pairing: PhonePairing) => Promise<void>;
  forget: () => Promise<void>;
};

export const PairingContext = createContext<PairingState | null>(null);
