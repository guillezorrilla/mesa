import type { PairStart, PhoneStatus, PushOutcome } from '@mesa/core';
import { command, type Recorded } from './spec';

/** The profile's Pairing with a phone (ADR-0027): show a QR, read the pairing, end it, push to it. */
export const phoneCommands = {
  'phone.status': command<PhoneStatus>('phone', 'status'),
  'phone.push': command<PushOutcome>('phone', 'push'),
  'phone.pushTest': command<{ pairingId: string; sent: true }>('phone', 'push-test'),
  'phone.pair': command<Recorded<PairStart & { svg: string }>>('phone', 'pair'),
  'phone.unpair': command<
    Recorded<{ unpaired: boolean; pairingId?: string; brokerRemoved?: boolean }>
  >('phone', 'unpair'),
};
