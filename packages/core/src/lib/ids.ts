import { createHash } from 'node:crypto';
import type { Clock } from './clock.js';

/** A source of new ids. Injected so receipts written in tests have known ids. */
export type IdSource = () => string;

/** A new id's last 8 characters, lowercase: 40 random bits, short enough to type. */
export const shortId = (newId: IdSource) => newId().slice(-8).toLowerCase();

/** Crockford base32's 32 characters, in order: no I, L, O, or U. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A ULID: 26 Crockford base32 characters; the first is 0 to 7, since 48 bits of time fit. */
export const ULID_PATTERN = `[0-7][${CROCKFORD}]{25}`;
export const ULID = new RegExp(`^${ULID_PATTERN}$`);

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

/** ULIDs: 48 bits of milliseconds from `clock`, then 80 bits from `random`, in Crockford base32. */
export function ulidSource(clock: Clock, random: (bytes: number) => Uint8Array): IdSource {
  return () => {
    let time = clock().getTime();
    let head = '';
    for (let i = 0; i < 10; i++) {
      head = CROCKFORD[time % 32] + head;
      time = Math.floor(time / 32);
    }
    let bits = 0n;
    for (const b of random(10)) bits = (bits << 8n) | BigInt(b);
    let tail = '';
    for (let i = 0; i < 16; i++) {
      tail = CROCKFORD[Number(bits & 31n)] + tail;
      bits >>= 5n;
    }
    return head + tail;
  };
}
