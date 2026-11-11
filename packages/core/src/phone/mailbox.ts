import { MesaError } from '../lib/result.js';
import { macKeys } from './mac-pairing.js';
import { brokerError, type PairingDeps } from './pair.js';
import {
  type Opened,
  openDeliveries,
  type PhoneMessage,
  sealMessage,
} from './protocol/envelope.js';

const pairedOrThrow = async (deps: PairingDeps) => {
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey)
    throw new MesaError('usage', 'this profile is not paired with a phone; mesa phone pair');
  return { ...pairing, phoneKey: pairing.phoneKey };
};

/** Seals a message for the phone and leaves it in the Mailbox. The seq is kept before it goes. */
export async function sendToPhone(deps: PairingDeps, message: PhoneMessage): Promise<void> {
  const pairing = await pairedOrThrow(deps);
  const seq = pairing.sentSeq + 1;
  await deps.store.write({ ...pairing, sentSeq: seq });
  const box = sealMessage(macKeys(pairing), pairing.pairingId, seq, deps.clock(), message);
  await deps
    .client(pairing.broker)
    .send(pairing.pairingId, pairing.macToken, box)
    .catch((error) => brokerError(error, pairing.broker));
}

/**
 * Takes what the phone left in the Mailbox, oldest first, and forgets it on the broker. A box that
 * does not open, or that repeats a seq already taken, is dropped unread.
 */
export async function takeFromPhone(deps: PairingDeps): Promise<Opened[]> {
  const pairing = await pairedOrThrow(deps);
  const client = deps.client(pairing.broker);
  const deliveries = await client
    .receive(pairing.pairingId, pairing.macToken)
    .catch((error) => brokerError(error, pairing.broker));
  const { opened, takenSeq, ackUpTo } = openDeliveries(
    macKeys(pairing),
    pairing.pairingId,
    deliveries,
    pairing.takenSeq,
  );
  if (ackUpTo === undefined) return opened;
  await deps.store.write({ ...pairing, takenSeq });
  await client.ack(pairing.pairingId, pairing.macToken, ackUpTo);
  return opened;
}
