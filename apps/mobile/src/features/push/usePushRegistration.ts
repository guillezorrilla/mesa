import { type PhonePairing, pairingClient } from '@mesa/core/phone';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

const register = (pairing: PhonePairing, deviceToken: string) =>
  pairingClient(fetch, pairing.broker)
    .registerDevice(pairing.pairingId, pairing.phoneToken, deviceToken)
    .catch(() => undefined);

/**
 * Once paired, asks to send notifications (iOS asks the person once) and gives the broker this
 * phone's APNs device token, again whenever iOS changes it, so the Mac's sealed pushes reach it
 * (#1016). A refusal or an unreachable broker leaves the app as it is; the next launch tries again.
 */
export function usePushRegistration(pairing: PhonePairing) {
  useEffect(() => {
    void Notifications.requestPermissionsAsync()
      .then(async ({ granted }) => {
        if (granted) await register(pairing, (await Notifications.getDevicePushTokenAsync()).data);
      })
      .catch(() => undefined);
    const changed = Notifications.addPushTokenListener(({ data }) => void register(pairing, data));
    return () => changed.remove();
  }, [pairing]);
}
