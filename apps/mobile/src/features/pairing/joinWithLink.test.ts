import { formatPairingLink, hashOf, newKeyPair, newSecret, pairingClient } from '@mesa/core/phone';
import { fakePairingBroker } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import type { Feel } from '@/lib/hapticPlayer';
import { joinWithLink } from './joinWithLink';

const NOW = new Date('2026-11-11T12:00:00.000Z');

/** The haptics a join played, in order. */
const felt = () => {
  const played: Feel[] = [];
  return { played, feel: (f: Feel) => void played.push(f) };
};

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

test('a scanned link pairs: the phone keeps its pairing, has sent its hello, and taps success', async () => {
  const { broker, link, pairingId } = await opened();
  const { played, feel } = felt();
  const result = await joinWithLink(broker.http, link, NOW, feel);
  expect(played).toEqual(['success']);
  expect(result.pairing).toMatchObject({
    pairingId,
    broker: 'https://broker.test',
    sentSeq: 1,
    takenSeq: 0,
  });
  expect(broker.rooms.get(pairingId)?.boxes).toHaveLength(1);
});

test('text that is not a pairing link, a used code and no network each say what to do, with an error tap', async () => {
  const { broker, link } = await opened();
  const { played, feel } = felt();
  expect(await joinWithLink(broker.http, 'https://example.com', NOW, feel)).toEqual({
    error: "That isn't a Mesa pairing code.",
  });
  await joinWithLink(broker.http, link, NOW, () => undefined);
  expect(await joinWithLink(broker.http, link, NOW, feel)).toEqual({
    error: 'This code was already used. Show a new one on your Mac.',
  });
  const offline = async () => {
    throw new Error('offline');
  };
  expect(await joinWithLink(offline, link, NOW, feel)).toEqual({
    error: "Couldn't reach Mesa's broker. Check your connection.",
  });
  expect(played).toEqual(['error', 'error', 'error']);
});
