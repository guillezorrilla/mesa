import type { PhonePairing } from '@mesa/core/phone';

/** A string store keyed by name: the Keychain in the app, a Map in tests. */
export type KeyValue = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

/** The ids of the pairings, in the order they were made. */
const INDEX = 'mesa.pairings';
/**
 * Where a phone kept its one pairing before #1069, and where a Notification Service Extension
 * built before it still looks: it keeps the first pairing, so such a build (which an update over
 * the air reaches) still opens that Mac's notices.
 */
const LEGACY = 'mesa.pairing';
/** Each pairing's own entry; the extension since #1069 reads every `mesa.pairing*`. */
export const pairingKey = (pairingId: string) => `mesa.pairing.${pairingId}`;

const parse = (text: string | null) => (text ? (JSON.parse(text) as PhonePairing) : undefined);

/**
 * The phone's pairings, one entry each plus an index of their ids, the first also under the
 * legacy key: reading adopts a legacy pairing, adding one already kept replaces it, and
 * forgetting one leaves the others as they are.
 */
export function pairingKeys(kv: KeyValue) {
  const ids = async (): Promise<string[]> => JSON.parse((await kv.get(INDEX)) ?? '[]');
  const save = (pairing: PhonePairing) =>
    kv.set(pairingKey(pairing.pairingId), JSON.stringify(pairing));
  const add = async (pairing: PhonePairing) => {
    await save(pairing);
    const kept = await ids();
    if (!kept.includes(pairing.pairingId))
      await kv.set(INDEX, JSON.stringify([...kept, pairing.pairingId]));
    if (!(await kv.get(LEGACY))) await kv.set(LEGACY, JSON.stringify(pairing));
  };
  return {
    read: async (): Promise<PhonePairing[]> => {
      const legacy = parse(await kv.get(LEGACY));
      if (legacy && !(await ids()).includes(legacy.pairingId)) await add(legacy);
      const texts = await Promise.all((await ids()).map((id) => kv.get(pairingKey(id))));
      return texts.flatMap((text) => (text ? [JSON.parse(text) as PhonePairing] : []));
    },
    /**
     * Saves a pairing still kept, as its last taken seq changes; one forgotten meanwhile (a box
     * taken as it was unpaired) stays gone, so the extension never opens notices with it.
     */
    write: async (pairing: PhonePairing) => {
      if ((await ids()).includes(pairing.pairingId)) await save(pairing);
    },
    add,
    /** Forgets one; when it was the legacy key's, the next pairing takes that key, if any. */
    forget: async (pairingId: string) => {
      await kv.remove(pairingKey(pairingId));
      const kept = (await ids()).filter((id) => id !== pairingId);
      await kv.set(INDEX, JSON.stringify(kept));
      if (parse(await kv.get(LEGACY))?.pairingId !== pairingId) return;
      const next = kept[0] ? await kv.get(pairingKey(kept[0])) : null;
      if (next) await kv.set(LEGACY, next);
      else await kv.remove(LEGACY);
    },
  };
}
