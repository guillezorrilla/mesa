import { formatPairingLink, hashOf, newKeyPair, newSecret, pairingClient } from '@mesa/core/phone';
import { fakePairingBroker } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import { joinWithLink } from './joinWithLink';

const NOW = new Date('2026-11-11T12:00:00.000Z');

/** A pairing the Mac opened on a fake broker, and the link its QR shows. */
async function opened() {
  const broker = fakePairingBroker('https://broker.test', () => NOW);
  const secret = newSecret();
  const { pairingId } = await pairingClient(broker.http, broker.broker).create(hashOf(secret));
  const link = formatPairingLink({
    broker: broker.broker,
    pairingId,
    secret,
    macKey: newKeyPair().publicKey,
  });
  return { broker, link, pairingId };
}

test('a scanned link pairs: the phone keeps its pairing and has sent its hello', async () => {
  const { broker, link, pairingId } = await opened();
  const result = await joinWithLink(broker.http, link, NOW);
  expect(result.pairing).toMatchObject({
    pairingId,
    broker: 'https://broker.test',
    sentSeq: 1,
    takenSeq: 0,
  });
  expect(broker.rooms.get(pairingId)?.boxes).toHaveLength(1);
});

test('text that is not a pairing link, a used code and no network each say what to do', async () => {
  const { broker, link } = await opened();
  expect(await joinWithLink(broker.http, 'https://example.com', NOW)).toEqual({
    error: "That isn't a Mesa pairing code.",
  });
  await joinWithLink(broker.http, link, NOW);
  expect(await joinWithLink(broker.http, link, NOW)).toEqual({
    error: 'This code was already used. Show a new one on your Mac.',
  });
  const offline = async () => {
    throw new Error('offline');
  };
  expect(await joinWithLink(offline, link, NOW)).toEqual({
    error: "Couldn't reach Mesa's broker. Check your connection.",
  });
});
