import {
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
} from 'node:crypto';
import { expect, test } from 'vitest';
import { openMessage, sealMessage } from './envelope.js';
import { formatPairingLink, parsePairingLink } from './link.js';
import { NOTICE_MAX, openNotice, sealNotice } from './notice.js';
import { base64url, fromBase64url, newKeyPair, newSecret, open, seal, sideKeys } from './seal.js';
import vectors from './vectors.json' with { type: 'json' };

const bytes = (text: string) => fromBase64url(text) as Uint8Array;
const macKeys = () =>
  sideKeys({
    side: 'mac',
    privateKey: vectors.macPrivateKey,
    peerPublicKey: vectors.phonePublicKey,
    pairingId: vectors.pairingId,
  });
const phoneKeys = () =>
  sideKeys({
    side: 'phone',
    privateKey: vectors.phonePrivateKey,
    peerPublicKey: vectors.macPublicKey,
    pairingId: vectors.pairingId,
  });

test('the vectors hold: both sides derive the same keys and the box seals to the same bytes', () => {
  expect(base64url(macKeys().seal)).toBe(vectors.macToPhoneKey);
  expect(base64url(macKeys().open)).toBe(vectors.phoneToMacKey);
  expect(phoneKeys().open).toEqual(macKeys().seal);
  expect(phoneKeys().seal).toEqual(macKeys().open);
  expect(seal(macKeys().seal, vectors.pairingId, vectors.plaintext, bytes(vectors.nonce))).toBe(
    vectors.macToPhoneBox,
  );
  expect(open(phoneKeys().open, vectors.pairingId, vectors.macToPhoneBox)).toBe(vectors.plaintext);
});

test("the vectors agree with Node's own X25519, HKDF and ChaCha20-Poly1305, a second implementation", () => {
  const key = (d: string | undefined, x: string) =>
    ({ key: { kty: 'OKP', crv: 'X25519', x, ...(d ? { d } : {}) }, format: 'jwk' }) as const;
  const shared = diffieHellman({
    privateKey: createPrivateKey(key(vectors.macPrivateKey, vectors.macPublicKey)),
    publicKey: createPublicKey(key(undefined, vectors.phonePublicKey)),
  });
  const macToPhone = Buffer.from(
    hkdfSync('sha256', shared, vectors.pairingId, 'mesa-phone/v1 mac-to-phone', 32),
  );
  expect(base64url(macToPhone)).toBe(vectors.macToPhoneKey);
  const cipher = createCipheriv('chacha20-poly1305', macToPhone, bytes(vectors.nonce), {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(`mesa-phone/v1 ${vectors.pairingId}`));
  const sealed = Buffer.concat([
    bytes(vectors.nonce),
    cipher.update(vectors.plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  expect(base64url(sealed)).toBe(vectors.macToPhoneBox);
});

test('a flipped byte, the wrong direction, another pairing or a replayed seq does not open', () => {
  const box = sealMessage(macKeys(), 3, new Date(0), {
    kind: 'text',
    text: 'hi',
  });
  const flipped = bytes(box);
  flipped[20] = (flipped[20] ?? 0) ^ 1;
  expect(openMessage(phoneKeys(), base64url(flipped), 0)).toBe('unreadable');
  expect(openMessage(macKeys(), box, 0)).toBe('unreadable');
  expect(openMessage({ ...phoneKeys(), pairingId: 'AnotherPairing00000000' }, box, 0)).toBe(
    'unreadable',
  );
  expect(openMessage(phoneKeys(), box, 3)).toBe('replayed');
  expect(openMessage(phoneKeys(), box, 2)).toEqual({
    seq: 3,
    at: '1970-01-01T00:00:00.000Z',
    message: { kind: 'text', text: 'hi' },
  });
  expect(openMessage(phoneKeys(), 'not base64!', 0)).toBe('unreadable');
  expect(openMessage(phoneKeys(), seal(macKeys().seal, vectors.pairingId, '{"v":1}'), 0)).toBe(
    'unreadable',
  );
});

test('a notice opens from the vectors, and a long one is clipped under the bound the broker takes', () => {
  expect(open(phoneKeys().open, vectors.pairingId, vectors.macToPhoneNotice)).toBe(
    vectors.noticePlaintext,
  );
  expect(openNotice(phoneKeys(), vectors.macToPhoneNotice)).toEqual({
    title: 'Fix the login bug',
    body: 'mesa: asks a question',
  });
  expect(openNotice(phoneKeys(), vectors.macToPhoneBox)).toBeUndefined();
  const long = sealNotice(macKeys(), {
    title: '\u{1F600}'.repeat(500),
    body: '\u0007'.repeat(900),
  });
  expect(long.length).toBeLessThanOrEqual(NOTICE_MAX);
  expect(openNotice(phoneKeys(), long)).toEqual({
    title: '\u{1F600}'.repeat(120),
    body: ' '.repeat(400),
  });
});

test('a pairing link round-trips, and a link with a bad broker, key or version is not one', () => {
  const link = {
    broker: 'https://mesa-broker.example.dev',
    pairingId: 'AbCdEfGhIjKlMnOpQrStUv',
    secret: newSecret(),
    macKey: newKeyPair().publicKey,
  };
  const text = formatPairingLink(link);
  expect(text.startsWith('mesa://pair?v=1&')).toBe(true);
  expect(parsePairingLink(` ${text}\n`)).toEqual(link);
  expect(parsePairingLink(text.replace('https%3A', 'http%3A'))).toBeUndefined();
  expect(
    parsePairingLink(formatPairingLink({ ...link, broker: 'http://localhost:8787' }))?.broker,
  ).toBe('http://localhost:8787');
  expect(parsePairingLink(formatPairingLink({ ...link, macKey: 'short' }))).toBeUndefined();
  expect(parsePairingLink(text.replace('v=1', 'v=2'))).toBeUndefined();
  expect(parsePairingLink('https://example.com')).toBeUndefined();
});
