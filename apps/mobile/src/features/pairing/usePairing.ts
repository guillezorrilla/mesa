import { use } from 'react';
import { PairingContext } from './pairingContext';

/** The phone's pairing; only under PairingProvider. */
export function usePairing() {
  const state = use(PairingContext);
  if (!state) throw new Error('usePairing outside PairingProvider');
  return state;
}
