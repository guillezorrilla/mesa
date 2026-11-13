import type { PhonePairing } from '@mesa/core/phone';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { pairingStore } from '../pairing/pairingStore';
import { type MacLink, macLink } from './macLink';

/**
 * One line per pairing, each its own socket: open while the app is in front (each reconnects
 * when it comes back), closed in the background and when its pairing goes. A line is kept while
 * its pairing is, so pairing or unpairing one Mac redials no other.
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

  // The lines open now: a change dials only the new ones and closes only the gone ones.
  const open = useRef(new Set<MacLink>());
  useEffect(() => {
    const now = new Set(links.values());
    for (const link of open.current) if (!now.has(link)) link.close();
    for (const link of now) if (!open.current.has(link)) link.connect();
    open.current = now;
  }, [links]);
  useEffect(() => {
    const change = AppState.addEventListener('change', (state) => {
      for (const link of open.current) state === 'active' ? link.connect() : link.close();
    });
    return () => {
      change.remove();
      for (const link of open.current) link.close();
      open.current = new Set();
    };
  }, []);
  return links;
}
