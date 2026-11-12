import type { ReactNode } from 'react';
import { usePairing } from '../pairing/usePairing';
import { MacContext } from './macContext';
import { useMacLink } from './useMacLink';

/** Holds the line to the paired Mac for every screen under it; none while unpaired. */
export function MacProvider({ children }: { children: ReactNode }) {
  const { pairing } = usePairing();
  const link = useMacLink(pairing);
  return <MacContext value={link}>{children}</MacContext>;
}
