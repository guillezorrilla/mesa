import type { PhonePairing } from '@mesa/core/phone';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { pairingStore } from '../pairing/pairingStore';
import { type MacLink, macLink } from './macLink';

/**
 * One line per pairing, each its own socket: open while the app is in front (each reconnects
 * when it comes back), closed in the background and when its pairing goes. A line is kept while
 * its pairing is, so pairing another Mac redials none.
 */
export function useMacLinks(pairings: PhonePairing[]) {
  const [held, setHeld] = useState(() => new Map<string, MacLink>());
  let links = held;
  if (pairings.map((p) => p.pairingId).join() !== [...held.keys()].join()) {
    links = new Map(
      pairings.map((pairing) => [
        pairing.pairingId,
        held.get(pairing.pairingId) ??
          macLink(pairing, (takenSeq) => void pairingStore.write({ ...pairing, takenSeq })),
      ]),
    );
    setHeld(links);
  }

  useEffect(() => {
    const all = [...links.values()];
    for (const link of all) link.connect();
    const change = AppState.addEventListener('change', (state) => {
      for (const link of all) state === 'active' ? link.connect() : link.close();
    });
    return () => {
      change.remove();
      for (const link of all) link.close();
    };
  }, [links]);
  return links;
}
