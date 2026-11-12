import type { PhoneGate } from '@mesa/core/phone';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMac } from '../mac/useMac';

/** How often Needs you asks again for open gates while the app is in front. */
const EVERY_MS = 60_000;

/**
 * The Mac's open decision gates for Needs you, asked on focus (back from a gate just resolved),
 * every minute, and on `refresh`. They never hold the listing: a Mac older than the phone does
 * not answer `gates`, and the last gates stay until one does.
 */
// ponytail: gates are asked, not pushed in updateMessage; push them if a new gate must show sooner.
export function useGates() {
  const link = useMac();
  const [gates, setGates] = useState<PhoneGate[]>([]);
  const refresh = () => {
    link.call({ method: 'gates' }).then(
      (answer) => setGates(answer.gates),
      () => undefined,
    );
  };
  const focused = useIsFocused();
  const onFocus = useEffectEvent(refresh);
  useEffect(() => {
    if (focused) onFocus();
  }, [focused]);
  useRepeatWhileActive(EVERY_MS, refresh);
  return { gates, refresh };
}
