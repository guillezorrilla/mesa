import { expect, test } from 'vitest';
import { fakePairingBroker } from '../../testing/pairing-broker.js';
import { fitsOneBox, PART_TIMEOUT_MS, partJoiner, splitParts } from './chunk.js';
import type { PhoneMessage } from './envelope.js';
import { mailbox } from './mailbox.js';
import { MacCallError, macCalls } from './requests.js';
import { newKeyPair, sideKeys } from './seal.js';

// 200 KB of text with multi-byte characters, so a cut may fall inside one.
const big = JSON.stringify({ text: 'reply é 🚀 '.repeat(20_000).slice(0, 200_000) });

test('a 200 KB payload goes as numbered parts that each seal under one box and come back whole', () => {
  const parts = splitParts('r1', big);
  expect(parts.length).toBeGreaterThan(40);
  expect(
    parts.every((part) => fitsOneBox(JSON.stringify({ v: 1, seq: 1e15, at: '', ...part }))),
  ).toBe(true);
  const joiner = partJoiner();
  const out = [...parts].reverse().map((part) => joiner.add(part, 0));
  expect(out.at(-1)).toBe(big);
  expect(out.slice(0, -1).every((piece) => piece === undefined)).toBe(true);
});

test('a replayed part changes nothing, and a missing part times out with the payload id', () => {
  const [first, second, third] = splitParts('r2', big.slice(0, 10_000));
  if (!first || !second || !third) throw new Error('expected three parts');
  const joiner = partJoiner();
  joiner.add(first, 0);
  joiner.add(first, 1);
  expect(joiner.add(third, 2)).toBeUndefined();
  expect(joiner.expire(PART_TIMEOUT_MS)).toEqual([]);
  expect(joiner.expire(PART_TIMEOUT_MS + 1)).toEqual(['r2']);
  expect(joiner.add(second, PART_TIMEOUT_MS + 2)).toBeUndefined();
});

/** A paired Mac and phone, each with a mailbox on the fake broker's socket. */
async function pairedMailboxes(now = () => new Date()) {
  const broker = fakePairingBroker();
  const { pairingId, macToken } = await broker
    .http(`${broker.broker}/pairings`, { method: 'POST', body: '{"joinHash":"h"}' })
    .then((r) => r.json());
  const mac = newKeyPair();
  const phone = newKeyPair();
  const room = broker.rooms.get(pairingId);
  if (!room) throw new Error('no room');
  Object.assign(room, { phoneToken: 'phone-token', joinedAt: new Date().toISOString() });
  const end = (side: 'mac' | 'phone', token: string, own: typeof mac, peer: typeof mac) => ({
    broker: broker.broker,
    pairingId,
    token,
    keys: sideKeys({ side, privateKey: own.privateKey, peerPublicKey: peer.publicKey, pairingId }),
    sentSeq: 0,
    takenSeq: 0,
  });
  const got = { mac: [] as PhoneMessage[], phone: [] as PhoneMessage[] };
  const lost: string[] = [];
  const deps = { connect: broker.connect, now };
  const macBox = mailbox(deps, end('mac', macToken, mac, phone), {
    message: (m) => got.mac.push(m),
  });
  const phoneBox = mailbox(deps, end('phone', 'phone-token', phone, mac), {
    message: (m) => got.phone.push(m),
    lost: (id) => lost.push(id),
  });
  return { broker, macBox, phoneBox, got, lost };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a call goes through both mailboxes and its 200 KB answer comes back whole', async () => {
  const { broker, macBox, phoneBox, got } = await pairedMailboxes();
  macBox.connect();
  phoneBox.connect();
  let ids = 0;
  const calls = macCalls({
    send: (m) => phoneBox.send(m),
    newId: () => `q${++ids}`,
    wait: () => new Promise(() => {}),
  });
  const answer = calls.call({ method: 'session', id: 'abc' });
  await settle();
  expect(got.mac).toEqual([{ kind: 'request', id: 'q1', call: { method: 'session', id: 'abc' } }]);
  const tail = Array.from({ length: 2000 }, (_, n) => `line ${n} ${'x'.repeat(90)}`);
  const row = {
    id: 'abc',
    title: 'Fix it',
    project: 'mesa',
    state: 'working',
    since: '2026-11-11T00:00:00.000Z',
    context: 12,
    unread: false,
  };
  macBox.send({
    kind: 'response',
    id: 'q1',
    result: { row, goal: null, replies: [], tail },
  });
  for (let i = 0; i < 200 && !got.phone.length; i++) await settle();
  calls.settle(got.phone[0] as PhoneMessage);
  expect((await answer).tail).toHaveLength(2000);
  // Every box was acked as it was taken, so nothing waits on the broker.
  expect([...broker.rooms.values()][0]?.boxes).toEqual([]);
});

test('a call nobody answers fails as a timeout', async () => {
  const calls = macCalls({ send: () => {}, newId: () => 'q1', wait: async () => {} });
  await expect(calls.call({ method: 'sessions' })).rejects.toEqual(
    new MacCallError('timeout', 'the Mac did not answer in time'),
  );
});

test('a connect right after a close gets a socket of its own, and the old one stays quiet', async () => {
  const { macBox, phoneBox, got } = await pairedMailboxes();
  macBox.connect();
  phoneBox.connect();
  await settle();
  phoneBox.close();
  phoneBox.connect();
  phoneBox.send({ kind: 'text', text: 'back' });
  for (let i = 0; i < 50 && !got.mac.length; i++) await settle();
  expect(got.mac).toEqual([{ kind: 'text', text: 'back' }]);
});

test('an answer whose part the broker lost is reported lost, with its id, once its time is up', async () => {
  let at = Date.parse('2026-11-11T12:00:00.000Z');
  const { broker, macBox, phoneBox, got, lost } = await pairedMailboxes(() => new Date(at));
  macBox.connect();
  await settle();
  macBox.send({ kind: 'response', id: 'q9', result: { tail: [big] } });
  const room = [...broker.rooms.values()][0];
  if (!room) throw new Error('no room');
  room.boxes.splice(1, 1);
  phoneBox.connect();
  for (let i = 0; i < 100; i++) await settle();
  expect(got.phone).toEqual([]);
  expect(lost).toEqual([]);
  at += PART_TIMEOUT_MS + 1;
  phoneBox.send({ kind: 'text', text: 'still there?' });
  expect(lost).toEqual(['q9']);
});
