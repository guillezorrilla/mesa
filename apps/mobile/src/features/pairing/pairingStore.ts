import type { PhonePairing } from '@mesa/core/phone';
import * as SecureStore from 'expo-secure-store';

const KEY = 'mesa.pairing';

/**
 * Where the pairing lives: the Keychain, in the access group the Notification Service Extension
 * shares (#1016), readable after the first unlock so a push that lands while locked still opens.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  accessGroup: 'EMTB6K854Q.com.guillezorrilla.mesa',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function readPairing(): Promise<PhonePairing | undefined> {
  const text = await SecureStore.getItemAsync(KEY, OPTIONS);
  return text ? (JSON.parse(text) as PhonePairing) : undefined;
}

export const writePairing = (pairing: PhonePairing) =>
  SecureStore.setItemAsync(KEY, JSON.stringify(pairing), OPTIONS);

export const forgetPairing = () => SecureStore.deleteItemAsync(KEY, OPTIONS);
