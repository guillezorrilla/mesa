import { useState } from 'react';
import { useMac } from '../mac/useMac';

/**
 * Keys pressed in terminal session `id` through its Mac, Ctrl held for the next letter (`ctrl`),
 * and why the last press failed; any press lets go of Ctrl, as does `releaseCtrl`.
 */
export function useKeys(id: string) {
  const link = useMac();
  const [ctrl, setCtrl] = useState(false);
  const [error, setError] = useState<string>();
  const press = (keys: string[]) => {
    setCtrl(false);
    link.call({ method: 'keys', id, keys }).then(
      () => setError(undefined),
      (failed: Error) => setError(`Keys not sent: ${failed.message}.`),
    );
  };
  return {
    ctrl,
    toggleCtrl: () => setCtrl((held) => !held),
    releaseCtrl: () => setCtrl(false),
    press,
    error,
  };
}
