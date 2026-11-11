import { z } from 'zod';
import type { SecretStore } from '../lib/secret-store.js';
import { sideKeys } from './protocol/seal.js';

/**
 * The Mac's half of a Pairing, one Keychain item per profile (service `mesa.<profile>.phone`,
 * account `pairing`, as ADR-0014 keeps a source's tokens): its private key and token never reach
 * config.yaml, the vault or a receipt. `secret` is kept only until the phone's hello proves it;
 * `phoneKey` is set only then.
 */
const macPairing = z.object({
  broker: z.string(),
  pairingId: z.string(),
  macToken: z.string(),
  privateKey: z.string(),
  publicKey: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  secret: z.string().optional(),
  phoneKey: z.string().optional(),
  pairedAt: z.string().optional(),
  sentSeq: z.number().int().nonnegative(),
  takenSeq: z.number().int().nonnegative(),
});
export type MacPairing = z.infer<typeof macPairing>;

const ACCOUNT = 'pairing';

export function macPairingStore(secrets: SecretStore, profile: string) {
  const service = `mesa.${profile}.phone`;
  return {
    read: async (): Promise<MacPairing | undefined> => {
      const text = await secrets.get(service, ACCOUNT);
      if (text === undefined) return undefined;
      try {
        return macPairing.parse(JSON.parse(text));
      } catch {
        return undefined;
      }
    },
    write: (pairing: MacPairing) => secrets.set(service, ACCOUNT, JSON.stringify(pairing)),
    remove: () => secrets.delete(service, ACCOUNT),
  };
}
export type MacPairingStore = ReturnType<typeof macPairingStore>;

/** The Mac's keys for a pairing whose phone is known. */
export const macKeys = (pairing: MacPairing & { phoneKey: string }) =>
  sideKeys({
    side: 'mac',
    privateKey: pairing.privateKey,
    peerPublicKey: pairing.phoneKey,
    pairingId: pairing.pairingId,
  });
