import type { UpdateMessage } from '@mesa/core/phone';
import { useEffect, useEffectEvent } from 'react';
import { useMac } from './useMac';

/** Runs `run` on each update this screen's Mac pushes, with the screen's latest state. */
export function useMacUpdates(run: (update: UpdateMessage) => void) {
  const link = useMac();
  const onUpdate = useEffectEvent(run);
  useEffect(() => link.onUpdate(onUpdate), [link]);
}
