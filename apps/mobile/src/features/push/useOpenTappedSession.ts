import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { tappedSession } from './tappedSession';

/** Opens the session a tapped push names, once per tap, whether the tap launched the app or not. */
export function useOpenTappedSession() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const session = tappedSession(response);
    if (!session) return;
    router.push(`/agents/${session}`);
    void Notifications.clearLastNotificationResponseAsync();
  }, [response]);
}
