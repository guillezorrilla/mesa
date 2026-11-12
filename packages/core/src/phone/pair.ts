import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import { type MacPairing, type MacPairingStore, macKeys } from './mac-pairing.js';
import { type PairingClient, PairingError } from './protocol/client.js';
import { openMessage } from './protocol/envelope.js';
import { formatPairingLink } from './protocol/link.js';
import { hashOf, newKeyPair, newSecret } from './protocol/seal.js';

export type PairingDeps = {
  store: MacPairingStore;
  /** The pairing routes of the broker at that origin. */
  client: (broker: string) => PairingClient;
  clock: Clock;
  /**
   * The LaunchAgent that runs the Mac's listener (`mesa phone serve`, ADR-0027): installed once a
   * phone is paired, removed on unpair. `ensure` says whether it is loaded.
   */
  listener: { ensure: () => Promise<boolean>; remove: () => Promise<unknown> };
};

export type PairStart = { pairingId: string; qr: string; expiresAt: string };
export type PhoneStatus = {
  paired: boolean;
  pairingId?: string;
  since?: string;
  phoneLastSeen?: string;
  /** A QR is out and no phone has proved it yet; it lapses at `expiresAt`. */
  pending?: boolean;
  expiresAt?: string;
  /** Paired: whether the listener that answers the phone is loaded (ADR-0027). */
  listening?: boolean;
};

/** Statuses that mean the broker holds no such pairing any more. */
const GONE = new Set([401, 404, 410]);

/** A broker failure, as the person reads it. */
export function brokerError(error: unknown, broker: string): never {
  if (!(error instanceof PairingError)) throw error;
  if (error.status === 0) throw new MesaError('internal', `couldn't reach the broker at ${broker}`);
  if (error.status === 429)
    throw new MesaError('internal', 'the broker is busy, wait a minute and try again');
  if (error.code === 'not_configured')
    throw new MesaError('internal', `the broker at ${broker} does not take phone pairings`);
  throw new MesaError('internal', error.message);
}

/** Installs or starts the listener (a paired profile always has one); false when it cannot run. */
const ensureListener = (deps: PairingDeps) => deps.listener.ensure().catch(() => false);

/** Whether a broker failure means it no longer holds the pairing. */
export const isGone = (error: unknown) => error instanceof PairingError && GONE.has(error.status);

/**
 * Opens a pairing on the broker and keeps the Mac's half: the QR's secret goes to the broker only
 * as a hash. A pending pairing is replaced; a confirmed one is kept until `unpair`.
 */
export async function startPairing(deps: PairingDeps, broker: string): Promise<PairStart> {
  const existing = await deps.store.read();
  if (existing?.phoneKey)
    throw new MesaError(
      'usage',
      `this profile is paired with a phone (${existing.pairingId}); mesa phone unpair first`,
    );
  if (existing)
    await deps
      .client(existing.broker)
      .remove(existing.pairingId, existing.macToken)
      .catch(() => {});
  const secret = newSecret();
  const keys = newKeyPair();
  const created = await deps
    .client(broker)
    .create(hashOf(secret))
    .catch((error) => brokerError(error, broker));
  await deps.store.write({
    broker,
    pairingId: created.pairingId,
    macToken: created.macToken,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    createdAt: deps.clock().toISOString(),
    expiresAt: created.expiresAt,
    secret,
    sentSeq: 0,
    takenSeq: 0,
  });
  return {
    pairingId: created.pairingId,
    qr: formatPairingLink({ broker, pairingId: created.pairingId, secret, macKey: keys.publicKey }),
    expiresAt: created.expiresAt,
  };
}

/** Confirms a joined phone from its hello: the box must open with its key and carry the secret. */
async function confirm(deps: PairingDeps, pairing: MacPairing, phoneKey: string, joinedAt: string) {
  const client = deps.client(pairing.broker);
  const keys = macKeys({ ...pairing, phoneKey });
  for (const delivery of await client.receive(pairing.pairingId, pairing.macToken)) {
    const opened = openMessage(keys, delivery.box, 0);
    if (typeof opened === 'string' || opened.message.kind !== 'hello') continue;
    if (opened.message.secret !== pairing.secret) continue;
    const { secret: _, ...rest } = pairing;
    await deps.store.write({ ...rest, phoneKey, pairedAt: joinedAt, takenSeq: opened.seq });
    await client.ack(pairing.pairingId, pairing.macToken, delivery.id);
    return true;
  }
  return false;
}

/**
 * Whether this profile is paired, confirming a phone that joined since the QR was shown. A pairing
 * the broker no longer holds (expired, or unpaired from the phone) is forgotten here too.
 */
export async function pairingStatus(deps: PairingDeps): Promise<PhoneStatus> {
  const pairing = await deps.store.read();
  if (!pairing) return { paired: false };
  const { pairingId } = pairing;
  const state = await deps
    .client(pairing.broker)
    .state(pairingId, pairing.macToken)
    .catch(async (error) => {
      if (isGone(error)) {
        await deps.store.remove();
        return undefined;
      }
      if (pairing.phoneKey) return 'unreachable' as const;
      return brokerError(error, pairing.broker);
    });
  if (!state) return { paired: false };
  if (pairing.phoneKey)
    return {
      paired: true,
      pairingId,
      ...(pairing.pairedAt ? { since: pairing.pairedAt } : {}),
      ...(state !== 'unreachable' && state.phoneSeenAt ? { phoneLastSeen: state.phoneSeenAt } : {}),
      listening: await ensureListener(deps),
    };
  if (state === 'unreachable') return { paired: false };
  if (
    state.phoneKey &&
    state.joinedAt &&
    (await confirm(deps, pairing, state.phoneKey, state.joinedAt))
  )
    return {
      paired: true,
      pairingId,
      since: state.joinedAt,
      phoneLastSeen: state.phoneSeenAt,
      listening: await ensureListener(deps),
    };
  return { paired: false, pending: true, pairingId, expiresAt: pairing.expiresAt };
}

/**
 * Ends the pairing on the broker and here. The Keychain item goes even when the broker cannot be
 * reached, so a lost phone never keeps a Mac paired; `brokerRemoved` says whether the broker heard.
 */
export async function unpair(
  deps: PairingDeps,
): Promise<{ unpaired: boolean; pairingId?: string; brokerRemoved?: boolean }> {
  const pairing = await deps.store.read();
  if (!pairing) return { unpaired: false };
  const brokerRemoved = await deps
    .client(pairing.broker)
    .remove(pairing.pairingId, pairing.macToken)
    .then(
      () => true,
      (error) => isGone(error),
    );
  await deps.store.remove();
  await deps.listener.remove().catch(() => undefined);
  return { unpaired: true, pairingId: pairing.pairingId, brokerRemoved };
}
