import type { ReactNode } from 'react';
import { usePairing } from '../pairing/usePairing';
import { MacContext } from './macContext';
import { macLabel } from './macLabel';
import { MacsContext } from './macsContext';
import { useMacLinks } from './useMacLinks';

/**
 * Holds a line to every paired Mac for the screens under it; the first is the Mac a screen talks
 * to unless a MacScope names another.
 */
export function MacProvider({ children }: { children: ReactNode }) {
  const { pairings } = usePairing();
  const links = useMacLinks(pairings);
  const macs = pairings.flatMap((pairing) => {
    const link = links.get(pairing.pairingId);
    return link ? [{ id: pairing.pairingId, name: macLabel(pairing), link }] : [];
  });
  return (
    <MacsContext value={macs}>
      <MacContext value={macs[0]?.link}>{children}</MacContext>
    </MacsContext>
  );
}
