import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import type { SecretStore } from '../lib/secret-store.js';
import type { SystemOneProvider } from './systemone.js';

// The keys of the hosted decision models (#488): a TypeSafe key for Jev, a Cloudflare API token for
// CLEF. They live in the Keychain only, as source connections do (ADR-0014).

/** Who issues each key: TypeSafe (Jev) or Cloudflare (CLEF). */
export const KEY_PROVIDERS = ['typesafe', 'cloudflare'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/** The key each model answers with. */
export const KEY_OF: Record<SystemOneProvider, KeyProvider> = {
  jev: 'typesafe',
  clef: 'cloudflare',
};

/** The model each key is for. */
export const MODEL_OF: Record<KeyProvider, SystemOneProvider> = {
  typesafe: 'jev',
  cloudflare: 'clef',
};

/** A key as Mesa shows it: whether it is set, when it was added, and its last 4 characters. */
export type KeyRow = { provider: KeyProvider; set: boolean; addedAt?: string; last4?: string };

/** The provider `input` names, or a usage error listing them. */
export function keyProvider(input: string): KeyProvider {
  const found = KEY_PROVIDERS.find((p) => p === input);
  if (!found)
    throw new MesaError('usage', `unknown key ${input}; one of ${KEY_PROVIDERS.join(', ')}`);
  return found;
}

// The item holds the key and when it was added, so the date needs no file beside the secret.
const StoredSchema = z.object({ key: z.string().min(1), addedAt: z.string().optional() });
type Stored = z.infer<typeof StoredSchema>;

/**
 * One profile's model keys: Keychain service `mesa-<profile>-decisions`, one item per provider.
 * Only `read` returns a key, for the call that sends it; `list` shows the last 4 characters.
 */
export function decisionKeys(store: SecretStore, profile: string) {
  const service = `mesa-${profile}-decisions`;
  /** The provider's key; an item that is not Mesa's JSON is taken as the bare key. */
  const read = async (provider: KeyProvider): Promise<Stored | undefined> => {
    const raw = await store.get(service, provider);
    if (!raw) return undefined;
    try {
      const parsed = StoredSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON: an item made by hand.
    }
    return { key: raw };
  };
  return {
    read,
    write: (provider: KeyProvider, key: string, addedAt: string) =>
      store.set(service, provider, JSON.stringify({ key, addedAt })),
    /** False when there was no key. */
    remove: (provider: KeyProvider) => store.delete(service, provider),
    list: (): Promise<KeyRow[]> =>
      Promise.all(
        KEY_PROVIDERS.map(async (provider) => {
          const stored = await read(provider);
          if (!stored) return { provider, set: false };
          const { key, addedAt } = stored;
          return { provider, set: true, ...(addedAt ? { addedAt } : {}), last4: key.slice(-4) };
        }),
      ),
  };
}

export type DecisionKeys = ReturnType<typeof decisionKeys>;
