import { createHash, generateKeyPairSync, sign } from 'node:crypto';

const wrap = (...lines: string[]) => Buffer.from(`${lines.join('\n')}\n`).toString('base64');

/**
 * An invented updater key: its public key and `.sig` files in Tauri's format (base64-wrapped
 * minisign, prehashed `ED` signatures), for archives signed with a key a test controls.
 */
export function minisignKey(keyId = Buffer.from('0123456789abcdef', 'hex')) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x ?? '', 'base64url');
  const pub = Buffer.concat([Buffer.from('Ed'), keyId, raw]);
  return {
    publicKey: wrap(
      `untrusted comment: minisign public key: ${keyId.toString('hex').toUpperCase()}`,
      pub.toString('base64'),
    ),
    sign: (data: Uint8Array, comment = 'timestamp:1790990498\tfile:Mesa.app.tar.gz') => {
      const signature = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
      const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
      return wrap(
        'untrusted comment: signature from tauri secret key',
        Buffer.concat([Buffer.from('ED'), keyId, signature]).toString('base64'),
        `trusted comment: ${comment}`,
        global.toString('base64'),
      );
    },
  };
}
