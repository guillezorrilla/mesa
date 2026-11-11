// The Pairing's crypto (ADR-0027): X25519 to agree a key, HKDF-SHA256 for one key per direction,
// ChaCha20-Poly1305 with a random 12-byte nonce to seal each message. Pure TypeScript on @noble,
// with no Node imports, so the Mac, the broker's tests and the phone share this one module; the
// phone's Notification Service Extension is the only other implementation, held to vectors.json.
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/** Who sealed a message: the Mac for the phone, or the phone for the Mac. */
export type Direction = 'mac-to-phone' | 'phone-to-mac';

/** The two keys of one side of a Pairing: one to seal what it sends, one to open what it gets. */
export type SideKeys = { seal: Uint8Array; open: Uint8Array };

const VERSION = 'mesa-phone/v1';
const NONCE = 12;

export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Undefined when `text` is not base64url. */
export function fromBase64url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A new X25519 key pair, both halves base64url. */
export function newKeyPair(): { privateKey: string; publicKey: string } {
  const secret = x25519.utils.randomSecretKey();
  return { privateKey: base64url(secret), publicKey: base64url(x25519.getPublicKey(secret)) };
}

/** 32 random bytes, base64url: a pairing's one-time secret. */
export const newSecret = () => base64url(randomBytes(32));

/** SHA-256 of a text, base64url: what the broker keeps of a secret or a token. */
export const hashOf = (text: string) => base64url(sha256(utf8ToBytes(text)));

const directionKey = (shared: Uint8Array, pairingId: string, direction: Direction) =>
  hkdf(sha256, shared, utf8ToBytes(pairingId), utf8ToBytes(`${VERSION} ${direction}`), 32);

/** One side's keys, from its private key and the other side's public key (both base64url). */
export function sideKeys(input: {
  side: 'mac' | 'phone';
  privateKey: string;
  peerPublicKey: string;
  pairingId: string;
}): SideKeys {
  const secret = fromBase64url(input.privateKey);
  const peer = fromBase64url(input.peerPublicKey);
  if (secret?.length !== 32 || peer?.length !== 32) throw new Error('a key is not 32 bytes');
  const shared = x25519.getSharedSecret(secret, peer);
  const outgoing: Direction = input.side === 'mac' ? 'mac-to-phone' : 'phone-to-mac';
  const incoming: Direction = input.side === 'mac' ? 'phone-to-mac' : 'mac-to-phone';
  return {
    seal: directionKey(shared, input.pairingId, outgoing),
    open: directionKey(shared, input.pairingId, incoming),
  };
}

/** Binds a box to its pairing, so one pairing's box never opens in another. */
const aadOf = (pairingId: string) => utf8ToBytes(`${VERSION} ${pairingId}`);

/** Seals text: base64url of the nonce then the ciphertext and its tag. `nonce` is for vectors. */
export function seal(
  key: Uint8Array,
  pairingId: string,
  text: string,
  nonce: Uint8Array = randomBytes(NONCE),
) {
  const sealed = chacha20poly1305(key, nonce, aadOf(pairingId)).encrypt(utf8ToBytes(text));
  return base64url(concatBytes(nonce, sealed));
}

/** Opens a box from `seal`, or undefined when it is not one sealed with this key for this pairing. */
export function open(key: Uint8Array, pairingId: string, box: string): string | undefined {
  const bytes = fromBase64url(box);
  if (!bytes || bytes.length < NONCE + 16) return undefined;
  try {
    const text = chacha20poly1305(key, bytes.subarray(0, NONCE), aadOf(pairingId)).decrypt(
      bytes.subarray(NONCE),
    );
    return new TextDecoder().decode(text);
  } catch {
    return undefined;
  }
}
