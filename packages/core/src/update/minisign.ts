import { createHash, createPublicKey, verify } from 'node:crypto';
import { MesaError } from '../lib/result.js';

/**
 * The key every update is signed with (#431's updater key). tauri.conf.json carries the same
 * public key for the app's updater; a test keeps the two equal.
 */
export const UPDATE_PUBLIC_KEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFDMEM3OUVFNkE4MEEwNTMKUldSVG9JQnE3bmtNckp5a3daa05YaUZMVENkcjlzenl6T1h0WjFRRGgzNm9WMGNGSU5KL20wRTAK';

/** The second line of a base64-wrapped minisign file (what Tauri's keys and `.sig` files are). */
const lines = (wrapped: string) => Buffer.from(wrapped, 'base64').toString('utf8').split('\n');

const refuse = (why: string) =>
  new MesaError('internal', `The update's signature does not verify: ${why}. Nothing was changed.`);

/**
 * Throws unless `signature` (a Tauri `.sig`: base64 of a minisign signature file) signs `data`
 * with `publicKey` (base64 of a minisign public key file), as Tauri's updater checks it: the key
 * ids match, the Ed25519 signature covers the file (BLAKE2b-512 prehashed for `ED`), and the
 * global signature covers the trusted comment.
 */
export function verifyMinisign(data: Uint8Array, signature: string, publicKey = UPDATE_PUBLIC_KEY) {
  const keyBytes = Buffer.from(lines(publicKey)[1] ?? '', 'base64');
  const [, sigLine = '', trusted = '', globalLine = ''] = lines(signature);
  const sigBytes = Buffer.from(sigLine, 'base64');
  if (keyBytes.length !== 42 || sigBytes.length !== 74 || !trusted.startsWith('trusted comment: '))
    throw refuse('it is not a minisign signature');
  if (!sigBytes.subarray(2, 10).equals(keyBytes.subarray(2, 10)))
    throw refuse('it was made with another key');
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: keyBytes.subarray(10).toString('base64url') },
    format: 'jwk',
  });
  const algorithm = sigBytes.subarray(0, 2).toString('latin1');
  const signed =
    algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : Buffer.from(data);
  if (!verify(null, signed, key, sigBytes.subarray(10)))
    throw refuse('the archive is not the one that was signed');
  const comment = Buffer.from(trusted.slice('trusted comment: '.length), 'utf8');
  const global = Buffer.from(globalLine, 'base64');
  if (!verify(null, Buffer.concat([sigBytes.subarray(10), comment]), key, global))
    throw refuse('its trusted comment was changed');
}
