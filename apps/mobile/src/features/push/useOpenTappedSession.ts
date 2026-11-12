import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { tappedSession } from './tappedSession';

const open = (response: Notifications.NotificationResponse | null) => {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const session = tappedSession(response);
  if (session) router.push(`/agents/${session}`);
};

/** Opens the session a tapped push names: the tap that launched the app, then each tap after. */
export function useOpenTappedSession() {
  useEffect(() => {
    open(Notifications.getLastNotificationResponse());
    void Notifications.clearLastNotificationResponseAsync();
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    return () => tapped.remove();
  }, []);
}
