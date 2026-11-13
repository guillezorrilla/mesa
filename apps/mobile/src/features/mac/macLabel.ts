import type { PhonePairing } from '@mesa/core/phone';

/** What the phone calls a paired Mac: the name its link gave, else "Mac" and its pairing's start. */
export const macLabel = (pairing: Pick<PhonePairing, 'name' | 'pairingId'>) =>
  pairing.name ?? `Mac ${pairing.pairingId.slice(0, 4)}`;
