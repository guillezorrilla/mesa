import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';
import { hapticPlayer } from './hapticPlayer';

// Haptics on this phone, and whether the person left them on: stored in the app's documents, on
// unless turned off in the phone's settings (HapticsSection).

const file = new File(Paths.document, 'haptics.json');
const read = () => {
  try {
    return (JSON.parse(file.textSync()) as { on?: unknown }).on !== false;
  } catch {
    return true;
  }
};
let on = file.exists ? read() : true;
const listeners = new Set<() => void>();

export function setHapticsOn(next: boolean) {
  on = next;
  for (const listener of listeners) listener();
  if (!file.exists) file.create();
  file.writeSync(JSON.stringify({ on }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Whether haptics are on, and its setter, for the setting's switch. */
export function useHapticsOn() {
  return [useSyncExternalStore(subscribe, () => on), setHapticsOn] as const;
}

/** Plays a feel (lib/hapticPlayer) on the Taptic Engine, unless haptics are off. */
export const haptic = hapticPlayer({
  on: () => on,
  notify: (type) => Haptics.notificationAsync(type as Haptics.NotificationFeedbackType),
  select: Haptics.selectionAsync,
});
