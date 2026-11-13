import type { PhonePairing } from '@mesa/core/phone';
import { createContext } from 'react';

/**
 * The phone's pairings, one per Mac or profile, in the order they were made; `pairing` is the
 * first, the Mac the tabs other than Agents talk to. Saving one already kept replaces it.
 */
export type PairingState = {
  pairings: PhonePairing[];
  pairing: PhonePairing | undefined;
  save: (pairing: PhonePairing) => Promise<void>;
  forget: (pairingId: string) => Promise<void>;
};

export const PairingContext = createContext<PairingState | null>(null);
