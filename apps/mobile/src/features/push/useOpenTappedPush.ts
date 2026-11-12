import { phoneKeys } from '@mesa/core/phone';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { usePairing } from '../pairing/usePairing';
import { tappedHref } from './tappedHref';

/** Opens what a tapped push names (tappedHref): the tap that launched the app, then each after. */
export function useOpenTappedPush() {
  const { pairing } = usePairing();
  const open = useEffectEvent((response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const href = tappedHref(response, pairing ? phoneKeys(pairing) : undefined);
    if (href) router.push(href);
  });
  useEffect(() => {
    open(Notifications.getLastNotificationResponse());
    void Notifications.clearLastNotificationResponseAsync();
    const tapped = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response),
    );
    return () => tapped.remove();
  }, []);
}
