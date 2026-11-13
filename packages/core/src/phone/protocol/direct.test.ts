import { expect, test } from 'vitest';
import { type PhoneMessage, sealMessage } from './envelope.js';
import { mailbox, type SocketEvents } from './mailbox.js';
import { newKeyPair, sideKeys } from './seal.js';
import { REORDER_US, takenSeqs } from './taken.js';

const pairingId = 'pairing-0123456789abcdef';
const mac = newKeyPair();
const phone = newKeyPair();
const macKeys = sideKeys({
  side: 'mac',
  privateKey: mac.privateKey,
  peerPublicKey: phone.publicKey,
  pairingId,
});
const phoneKeys = sideKeys({
  side: 'phone',
  privateKey: phone.privateKey,
  peerPublicKey: mac.publicKey,
  pairingId,
});
const at = new Date('2026-11-12T12:00:00Z');
const fromPhone = (seq: number, message: PhoneMessage) => sealMessage(phoneKeys, seq, at, message);

/** The Mac's mailbox, its relay socket's events for the test to drive, and what it took. */
function macMailbox() {
  let relay: SocketEvents | undefined;
  const sent: string[] = [];
  const got: PhoneMessage[] = [];
  const box = mailbox(
    {
      connect: (_url, on) => {
        relay = on;
        return { send: (data) => sent.push(data), close: () => {} };
      },
      now: () => at,
    },
    {
      broker: 'https://broker.test',
      pairingId,
      token: 'mac',
      keys: macKeys,
      sentSeq: 0,
      takenSeq: 0,
    },
    { message: (message) => got.push(message) },
  );
  box.connect();
  const frame = (fields: object) => relay?.message(JSON.stringify(fields));
  frame({ t: 'ready' });
  return { box, frame, sent, got };
}

/** A socket the phone (or a stranger) opened to the Mac's own. */
const peerSocket = () => {
  const sent: string[] = [];
  let closed = false;
  const socket = {
    send: (data: string) => sent.push(data),
    close: () => {
      closed = true;
    },
  };
  return { socket, sent, closed: () => closed };
};

test('a box both paths deliver is taken once, and one the relay delivers late is still taken', () => {
  const { box, frame, got } = macMailbox();
  const peer = peerSocket();
  const direct = box.accept(peer.socket);
  direct.message(JSON.stringify({ t: 'auth', box: fromPhone(100, { kind: 'direct' }) }));
  expect(peer.sent).toEqual([JSON.stringify({ t: 'ready' })]);

  const both = fromPhone(300, { kind: 'text', text: 'over both paths' });
  direct.message(JSON.stringify({ t: 'send', box: both }));
  frame({ t: 'msg', id: 1, box: both });
  frame({ t: 'msg', id: 2, box: fromPhone(200, { kind: 'text', text: 'late by the relay' }) });
  expect(got).toEqual([
    { kind: 'direct' },
    { kind: 'text', text: 'over both paths' },
    { kind: 'text', text: 'late by the relay' },
  ]);
});

test('the Mac answers on the path the phone last spoke on', () => {
  const { box, frame, sent } = macMailbox();
  const peer = peerSocket();
  box
    .accept(peer.socket)
    .message(JSON.stringify({ t: 'auth', box: fromPhone(100, { kind: 'direct' }) }));
  box.send({ kind: 'text', text: 'direct' });
  expect(peer.sent.map((data) => JSON.parse(data).t)).toEqual(['ready', 'msg']);

  frame({ t: 'msg', id: 1, box: fromPhone(200, { kind: 'direct' }) });
  box.send({ kind: 'text', text: 'relay' });
  expect(peer.sent).toHaveLength(2);
  expect(sent.map((data) => JSON.parse(data).t)).toEqual(['ack', 'send']);
});

test('a stranger on the network, or a replayed hello, gets the socket closed and nothing else', () => {
  const { box } = macMailbox();
  const hello = fromPhone(100, { kind: 'direct' });
  const phoneSide = peerSocket();
  box.accept(phoneSide.socket).message(JSON.stringify({ t: 'auth', box: hello }));

  for (const frame of [
    { t: 'auth', box: hello },
    { t: 'auth', token: 'phone-token' },
    { t: 'send', box: fromPhone(200, { kind: 'text', text: 'no hello first' }) },
    { t: 'auth', box: sealMessage(macKeys, 300, at, { kind: 'direct' }) },
  ]) {
    const stranger = peerSocket();
    box.accept(stranger.socket).message(JSON.stringify(frame));
    expect(stranger.closed()).toBe(true);
    expect(stranger.sent).toEqual([]);
  }
});

test('seqs are taken once, out of order within REORDER_US, and never under the last kept', () => {
  const seqs = takenSeqs(1000);
  expect(seqs.take(1000)).toBe(false);
  expect(seqs.take(5000)).toBe(true);
  expect(seqs.take(3000)).toBe(true);
  expect(seqs.take(3000)).toBe(false);
  expect(seqs.last()).toBe(5000);
  expect(seqs.take(5000 + REORDER_US + 1)).toBe(true);
  expect(seqs.floor()).toBe(5001);
  expect(seqs.take(5001)).toBe(false);
  expect(seqs.take(5002)).toBe(true);
});
