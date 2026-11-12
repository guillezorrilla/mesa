import type { Http } from '../lib/http.js';
import { pairingClient } from '../phone/protocol/client.js';
import { openDeliveries, type PhoneMessage, sealMessage } from '../phone/protocol/envelope.js';
import { joinPairing, type PhonePairing, phoneKeys } from '../phone/protocol/join.js';
import { parsePairingLink } from '../phone/protocol/link.js';
import { openNotice } from '../phone/protocol/notice.js';

/**
 * A phone, as the app pairs and talks (the same protocol module): `join` scans a pairing link,
 * `send` seals for the Mac, `take` opens what the Mac left, `allowPushes` registers a device token
 * and `openPush` opens a pushed notice as the Notification Service Extension does.
 */
export function fakePhone(http: Http, now = () => new Date()) {
  let pairing: PhonePairing | undefined;
  const paired = () => {
    if (!pairing) throw new Error('fakePhone: join first');
    return pairing;
  };
  return {
    join: async (link: string) => {
      const parsed = parsePairingLink(link);
      if (!parsed) throw new Error(`fakePhone: not a pairing link: ${link}`);
      pairing = await joinPairing(pairingClient(http, parsed.broker), parsed, now());
      return pairing;
    },
    send: async (message: PhoneMessage) => {
      const p = paired();
      p.sentSeq += 1;
      const box = sealMessage(phoneKeys(p), p.sentSeq, now(), message);
      await pairingClient(http, p.broker).send(p.pairingId, p.phoneToken, box);
    },
    take: async () => {
      const p = paired();
      const client = pairingClient(http, p.broker);
      const { opened, takenSeq, ackUpTo } = openDeliveries(
        phoneKeys(p),
        await client.receive(p.pairingId, p.phoneToken),
        p.takenSeq,
      );
      p.takenSeq = takenSeq;
      if (ackUpTo !== undefined) await client.ack(p.pairingId, p.phoneToken, ackUpTo);
      return opened.map((o) => o.message);
    },
    allowPushes: async (deviceToken = 'ab'.repeat(32)) => {
      const p = paired();
      await pairingClient(http, p.broker).registerDevice(p.pairingId, p.phoneToken, deviceToken);
    },
    openPush: (notice: string) => openNotice(phoneKeys(paired()), notice),
    get pairing() {
      return pairing;
    },
  };
}
