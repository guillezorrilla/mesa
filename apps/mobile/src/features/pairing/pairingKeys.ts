import type { PhonePairing } from '@mesa/core/phone';

/** A string store keyed by name: the Keychain in the app, a Map in tests. */
export type KeyValue = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

/** The ids of the pairings, in the order they were made. */
const INDEX = 'mesa.pairings';
/** Where a phone paired before #1069 kept its one pairing. */
const LEGACY = 'mesa.pairing';
/** Each pairing's own entry; the Notification Service Extension reads every `mesa.pairing*`. */
export const pairingKey = (pairingId: string) => `mesa.pairing.${pairingId}`;

/**
 * The phone's pairings, one entry each plus an index of their ids: reading moves a legacy
 * pairing to its own entry, adding one already kept replaces it, and forgetting one leaves the
 * others as they are.
 */
export function pairingKeys(kv: KeyValue) {
  const ids = async (): Promise<string[]> => JSON.parse((await kv.get(INDEX)) ?? '[]');
  const write = (pairing: PhonePairing) =>
    kv.set(pairingKey(pairing.pairingId), JSON.stringify(pairing));
  const add = async (pairing: PhonePairing) => {
    await write(pairing);
    const kept = await ids();
    if (!kept.includes(pairing.pairingId))
      await kv.set(INDEX, JSON.stringify([...kept, pairing.pairingId]));
  };
  return {
    read: async (): Promise<PhonePairing[]> => {
      const legacy = await kv.get(LEGACY);
      if (legacy) {
        await add(JSON.parse(legacy) as PhonePairing);
        await kv.remove(LEGACY);
      }
      const texts = await Promise.all((await ids()).map((id) => kv.get(pairingKey(id))));
      return texts.flatMap((text) => (text ? [JSON.parse(text) as PhonePairing] : []));
    },
    /** Saves a pairing already kept, as its last taken seq changes. */
    write,
    add,
    forget: async (pairingId: string) => {
      await kv.remove(pairingKey(pairingId));
      const kept = (await ids()).filter((id) => id !== pairingId);
      await kv.set(INDEX, JSON.stringify(kept));
    },
  };
}
