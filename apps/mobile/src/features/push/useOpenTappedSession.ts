import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { tappedSession } from './tappedSession';

const open = (response: Notifications.NotificationResponse | null) => {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const tapped = tappedSession(response);
  if (!tapped) return;
  router.push({
    pathname: '/agents/[id]',
    params: { id: tapped.session, ...(tapped.mac ? { mac: tapped.mac } : {}) },
  });
};

/** Opens the session a tapped push names, on the Mac that sent it: the tap that launched the app, then each tap after. */
export function useOpenTappedSession() {
  useEffect(() => {
    open(Notifications.getLastNotificationResponse());
    void Notifications.clearLastNotificationResponseAsync();
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    return () => tapped.remove();
  }, []);
}
