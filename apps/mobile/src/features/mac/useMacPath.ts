import { use, useSyncExternalStore } from 'react';
import { MacsContext } from './macsContext';

/** The path the line to a paired Mac takes now, following each change; undefined with no line. */
export function useMacPath(pairingId: string) {
  const link = use(MacsContext).find((mac) => mac.id === pairingId)?.link;
  return useSyncExternalStore(
    (changed) => link?.onPath(changed) ?? (() => {}),
    () => link?.path(),
  );
}
