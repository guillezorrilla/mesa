import { use } from 'react';
import { MacContext } from './macContext';

/** The line to the paired Mac; only on screens shown while paired. */
export function useMac() {
  const link = use(MacContext);
  if (!link) throw new Error('useMac while unpaired');
  return link;
}
