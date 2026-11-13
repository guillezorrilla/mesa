import * as SecureStore from 'expo-secure-store';
import { pairingKeys } from './pairingKeys';

/**
 * Where the pairings live: the Keychain, in the access group the Notification Service Extension
 * shares (#1016), readable after the first unlock so a push that lands while locked still opens.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  accessGroup: 'EMTB6K854Q.com.guillezorrilla.mesa',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const pairingStore = pairingKeys({
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
});
