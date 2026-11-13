import { use } from 'react';
import { MacContext } from './macContext';

/** The line to the Mac this screen talks to (MacScope, else the first); only while paired. */
export function useMac() {
  const link = use(MacContext);
  if (!link) throw new Error('useMac while unpaired');
  return link;
}
