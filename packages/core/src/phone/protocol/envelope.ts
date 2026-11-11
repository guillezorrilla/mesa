import { z } from 'zod';
import type { Delivery } from './client.js';
import { open, type SideKeys, seal } from './seal.js';

/**
 * What a sealed box holds. `seq` counts up from 1 on each side, so a box the broker replays or
 * reorders is refused. `hello` is the phone's first message, proving it read the Mac's QR;
 * `text` is a plain note, for checking a pairing end to end. Later kinds join this union.
 */
export const phoneMessage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello'), secret: z.string() }),
  z.object({ kind: z.literal('text'), text: z.string().max(4000) }),
]);
export type PhoneMessage = z.infer<typeof phoneMessage>;

const envelope = z.object({ v: z.literal(1), seq: z.number().int().positive(), at: z.string() });

export type Opened = { seq: number; at: string; message: PhoneMessage };

/** Seals one message as the `seq`th this side has sent. */
export function sealMessage(keys: SideKeys, seq: number, at: Date, message: PhoneMessage): string {
  return seal(
    keys.seal,
    keys.pairingId,
    JSON.stringify({ v: 1, seq, at: at.toISOString(), ...message }),
  );
}

/**
 * Opens a box from the other side, or says why not: `unreadable` when it does not open with these
 * keys or holds no message Mesa knows, `replayed` when its `seq` is not above the last one taken.
 */
export function openMessage(
  keys: SideKeys,
  box: string,
  lastSeq: number,
): Opened | 'unreadable' | 'replayed' {
  const text = open(keys.open, keys.pairingId, box);
  if (text === undefined) return 'unreadable';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'unreadable';
  }
  const head = envelope.safeParse(raw);
  const message = phoneMessage.safeParse(raw);
  if (!head.success || !message.success) return 'unreadable';
  if (head.data.seq <= lastSeq) return 'replayed';
  return { seq: head.data.seq, at: head.data.at, message: message.data };
}

/**
 * Opens what the broker delivered, oldest first: the messages that open and move `seq` on, the new
 * last seq taken, and the delivery id to ack (the last one, read or dropped), if any.
 */
export function openDeliveries(
  keys: SideKeys,
  deliveries: Delivery[],
  takenSeq: number,
): { opened: Opened[]; takenSeq: number; ackUpTo?: number } {
  const opened: Opened[] = [];
  let last = takenSeq;
  for (const delivery of deliveries) {
    const result = openMessage(keys, delivery.box, last);
    if (typeof result === 'string') continue;
    opened.push(result);
    last = result.seq;
  }
  const ackUpTo = deliveries.at(-1)?.id;
  return { opened, takenSeq: last, ...(ackUpTo === undefined ? {} : { ackUpTo }) };
}
