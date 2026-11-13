import * as Haptics from 'expo-haptics';
import { fileStore } from './fileStore';
import { type Feel, hapticPlayer } from './hapticPlayer';

/** Whether the person left haptics on: on unless turned off in the phone's settings. */
export const hapticsOn = fileStore('haptics.json', (text) => text.trim() !== 'false', true);

const NOTIFICATIONS = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} satisfies Record<Exclude<Feel, 'selection'>, Haptics.NotificationFeedbackType>;

/** Plays a feel (lib/hapticPlayer) on the Taptic Engine, unless haptics are off. */
export const haptic = hapticPlayer({
  on: hapticsOn.get,
  notify: (type) => Haptics.notificationAsync(NOTIFICATIONS[type]),
  select: Haptics.selectionAsync,
});
