import type { PairingClient } from './client.js';
import { sealMessage } from './envelope.js';
import type { PairingLink } from './link.js';
import { hashOf, newKeyPair, sideKeys } from './seal.js';

/** What the phone keeps of its pairing, in its Keychain. */
export type PhonePairing = {
  broker: string;
  pairingId: string;
  phoneToken: string;
  privateKey: string;
  macKey: string;
  /** The last `seq` sent and the last taken, so neither side's box is taken twice. */
  sentSeq: number;
  takenSeq: number;
  /** What the phone calls the Mac, from its link; none from a Mac older than the name. */
  name?: string;
};

/** The phone's keys for its pairing. */
export const phoneKeys = (pairing: PhonePairing) =>
  sideKeys({
    side: 'phone',
    privateKey: pairing.privateKey,
    peerPublicKey: pairing.macKey,
    pairingId: pairing.pairingId,
  });

/**
 * The phone's side of pairing: joins with the link's secret hash and a new key pair, then sends
 * the sealed hello carrying the secret itself, which only a phone that read the QR can seal, so the
 * Mac trusts the phone's key from that hello and not from the broker's word.
 */
export async function joinPairing(
  client: PairingClient,
  link: PairingLink,
  now: Date,
): Promise<PhonePairing> {
  const keys = newKeyPair();
  const { phoneToken } = await client.join(link.pairingId, hashOf(link.secret), keys.publicKey);
  const pairing: PhonePairing = {
    broker: link.broker,
    pairingId: link.pairingId,
    phoneToken,
    privateKey: keys.privateKey,
    macKey: link.macKey,
    sentSeq: 1,
    takenSeq: 0,
    ...(link.name ? { name: link.name } : {}),
  };
  const hello = sealMessage(phoneKeys(pairing), 1, now, {
    kind: 'hello',
    secret: link.secret,
  });
  await client.send(link.pairingId, phoneToken, hello);
  return pairing;
}
