import type { PhoneGate } from '@mesa/core/phone';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { rememberMac } from '../mac/sessionMacs';
import { useMacs } from '../mac/useMacs';
import type { OnMac } from '../sessions/agentRows';

/** How often Needs you asks again for open gates while the app is in front. */
const EVERY_MS = 60_000;

/**
 * Every paired Mac's open decision gates for Needs you, each naming its Mac, asked on focus (back
 * from a gate just resolved), every minute, and on `refresh`. They never hold the listing: a Mac
 * older than the phone does not answer `gates`, and its last gates stay until one does.
 */
// ponytail: gates are asked, not pushed in updateMessage; push them if a new gate must show sooner.
export function useGates() {
  const macs = useMacs();
  const [gates, setGates] = useState<OnMac<PhoneGate>[]>([]);
  const refresh = () => {
    for (const mac of macs)
      mac.link.call({ method: 'gates' }).then(
        (answer) => {
          rememberMac(
            mac.id,
            answer.gates.map((gate) => gate.id),
          );
          setGates((all) => [
            ...all.filter((gate) => gate.mac !== mac.id),
            ...answer.gates.map((gate) => ({ ...gate, mac: mac.id })),
          ]);
        },
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
