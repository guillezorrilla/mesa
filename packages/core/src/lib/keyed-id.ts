import { createHash } from 'node:crypto';
import { CROCKFORD } from './ids.js';

// Ids derived from a key, so a retry gets the same one. Apart from lib/ids.ts because node:crypto
// must stay out of `@mesa/core/browser`.

/** The ULID-shaped id `key` always names (from its sha256): a retry with the same key gets it. */
export function keyedId(key: string): string {
  let bits = BigInt(`0x${createHash('sha256').update(key).digest('hex')}`);
  let id = '';
  for (let i = 0; i < 25; i++) {
    id = CROCKFORD[Number(bits & 31n)] + id;
    bits >>= 5n;
  }
  return CROCKFORD[Number(bits & 7n)] + id;
}
