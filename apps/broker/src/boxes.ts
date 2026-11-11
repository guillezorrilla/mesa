// A Pairing's waiting boxes: kept per side, oldest first, at most KEEP_COUNT and KEEP_MS each.

/** The KV part of a Durable Object's storage, which SQLite backs. */
export type PairingStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
  delete: (keys: string[]) => Promise<number>;
  list: <T>(options: { prefix: string }) => Promise<Map<string, T>>;
  deleteAll: () => Promise<void>;
  getAlarm: () => Promise<number | null>;
  setAlarm: (at: number) => Promise<void>;
};

export type Side = 'mac' | 'phone';
export type Box = { id: number; box: string; at: string };

/** How long a box waits for a side that does not come. */
export const KEEP_MS = 7 * 24 * 60 * 60_000;
/** How many boxes wait for one side; a newer one drops the oldest. */
export const KEEP_COUNT = 200;
/** The longest box taken, in base64url characters. */
export const BOX_MAX = 8192;

const keyOf = (side: Side, id: number) => `box:${side}:${String(id).padStart(12, '0')}`;

export function boxStore(storage: PairingStorage, now: () => Date) {
  /** The boxes waiting for `side`, oldest first, dropping any past KEEP_MS. */
  const waiting = async (side: Side): Promise<Box[]> => {
    const boxes = [...(await storage.list<Box>({ prefix: `box:${side}:` })).values()];
    const cutoff = now().getTime() - KEEP_MS;
    const stale = boxes.filter((box) => Date.parse(box.at) < cutoff);
    if (stale.length) await storage.delete(stale.map((box) => keyOf(side, box.id)));
    return boxes.filter((box) => Date.parse(box.at) >= cutoff);
  };
  return {
    waiting,
    /** Keeps a box for `side`, then drops the oldest past KEEP_COUNT. */
    keep: async (side: Side, box: Box) => {
      await storage.put(keyOf(side, box.id), box);
      const all = await waiting(side);
      const over = all.slice(0, Math.max(0, all.length - KEEP_COUNT));
      if (over.length) await storage.delete(over.map((old) => keyOf(side, old.id)));
    },
    /** Forgets every box for `side` up to and including `upTo`. */
    ack: async (side: Side, upTo: number) => {
      const taken = (await waiting(side)).filter((box) => box.id <= upTo);
      if (taken.length) await storage.delete(taken.map((box) => keyOf(side, box.id)));
    },
    /** When the oldest box still waiting for either side runs out, if any waits. */
    nextExpiry: async () => {
      const oldest = [...(await waiting('mac')), ...(await waiting('phone'))]
        .map((box) => Date.parse(box.at))
        .sort((a, b) => a - b)[0];
      return oldest === undefined ? undefined : oldest + KEEP_MS;
    },
  };
}
