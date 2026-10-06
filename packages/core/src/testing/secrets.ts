import type { SecretStore } from '../lib/secret-store.js';

/** A Keychain in memory: `items` by `<service> <account>`. */
export function memorySecretStore() {
  const items = new Map<string, string>();
  const key = (service: string, account: string) => `${service} ${account}`;
  const store: SecretStore = {
    get: async (service, account) => items.get(key(service, account)),
    set: async (service, account, value) => void items.set(key(service, account), value),
    delete: async (service, account) => items.delete(key(service, account)),
  };
  return { store, items };
}
