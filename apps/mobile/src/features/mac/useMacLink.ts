import type { PhonePairing } from '@mesa/core/phone';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { writePairing } from '../pairing/pairingStore';
import { type MacLink, macLink } from './macLink';

/**
 * One line to the Mac per pairing: open while the app is in front (the socket reconnects when it
 * comes back), closed in the background and on unpair.
 */
export function useMacLink(pairing: PhonePairing | undefined) {
  const [held, setHeld] = useState<{ pairingId: string; link: MacLink }>();
  let link = held?.link;
  if (pairing && held?.pairingId !== pairing.pairingId) {
    link = macLink(pairing, (takenSeq) => void writePairing({ ...pairing, takenSeq }));
    setHeld({ pairingId: pairing.pairingId, link });
  }
  if (!pairing) link = undefined;

  useEffect(() => {
    if (!link) return;
    link.connect();
    const change = AppState.addEventListener('change', (state) =>
      state === 'active' ? link.connect() : link.close(),
    );
    return () => {
      change.remove();
      link.close();
    };
  }, [link]);
  return link;
}
