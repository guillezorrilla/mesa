import { useSyncExternalStore } from 'react';
import { hapticsOn } from './haptics';

/** Whether haptics are on, and its setter, for the setting's switch. */
export function useHapticsOn() {
  return [useSyncExternalStore(hapticsOn.subscribe, hapticsOn.get), hapticsOn.set] as const;
}
