import type { PairStart, PhoneStatus, PushOutcome, QueuedEntry } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/**
 * The profile's Pairing with a phone (ADR-0027): show a QR, read the pairing, end it, push to it;
 * and the replies it queued.
 */
export const phoneCommands = {
  'phone.status': command<PhoneStatus>('phone', 'status'),
  'phone.push': command<PushOutcome>('phone', 'push'),
  'phone.pushTest': command<{ pairingId: string; sent: true }>('phone', 'push-test'),
  'phone.pair': command<Recorded<PairStart & { svg: string }>>('phone', 'pair'),
  'phone.unpair': command<
    Recorded<{ unpaired: boolean; pairingId?: string; brokerRemoved?: boolean }>
  >('phone', 'unpair'),
  /** The replies the phone queued for a busy session (CONTEXT.md, Queued message). */
  'queue.list': commandWith<{ session: string }, QueuedEntry[]>(({ session }) => [
    'queue',
    'list',
    session,
  ]),
  'queue.remove': commandWith<{ id: string }, { id: string; removed: true }>(({ id }) => [
    'queue',
    'remove',
    id,
  ]),
};
