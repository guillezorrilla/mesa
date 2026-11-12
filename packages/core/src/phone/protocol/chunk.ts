// Messages over one box (the broker takes at most 8,192 characters) travel as numbered parts: the
// message's JSON as UTF-8, cut into slices sent base64url, and put back together on the other side.
// Each part is a sealed message of its own, with its own seq, so a part replayed or reordered by
// the broker is refused like any box; a payload missing a part past PART_TIMEOUT_MS is dropped.
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { base64url, fromBase64url } from './seal.js';

/**
 * The most UTF-8 bytes a message's JSON may have and still seal under 8,192 characters with its
 * envelope: a box is base64url of 28 bytes of nonce and tag plus the JSON.
 */
export const BOX_BYTES = 6000;
/** Bytes of payload per part: 5,462 base64url characters, so a part also seals under one box. */
const PART_BYTES = 4096;
/** At most 600 KB in one payload, so its parts fit the 200 boxes the broker keeps for a side. */
const MAX_PARTS = 150;
/** Under the phone's 10 s call timeout, so a call whose answer lost a part fails as lost. */
export const PART_TIMEOUT_MS = 8000;

export const partMessage = z.object({
  kind: z.literal('part'),
  /** The payload's id: its request's or response's id, else the seq of its first part. */
  id: z.string().max(64),
  n: z.number().int().nonnegative(),
  of: z.number().int().min(2).max(MAX_PARTS),
  data: z.string(),
});
export type PartMessage = z.infer<typeof partMessage>;

/** Whether `json` seals into one box. */
export const fitsOneBox = (json: string) => utf8ToBytes(json).length <= BOX_BYTES;

/** Cuts `json` into the parts that carry it, `id` naming the payload. */
export function splitParts(id: string, json: string): PartMessage[] {
  const bytes = utf8ToBytes(json);
  const of = Math.ceil(bytes.length / PART_BYTES);
  if (of > MAX_PARTS) throw new Error(`a phone message of ${bytes.length} bytes is over 600 KB`);
  return Array.from({ length: of }, (_, n) => ({
    kind: 'part',
    id,
    n,
    of,
    data: base64url(bytes.subarray(n * PART_BYTES, (n + 1) * PART_BYTES)),
  }));
}

type Gathering = { since: number; of: number; data: (Uint8Array | undefined)[] };

/**
 * Puts parts back together: `add` returns the payload's JSON once its last part is in (a part
 * already in changes nothing), and `expire` drops the payloads still missing a part after
 * `timeoutMs`, returning their ids so the side that waits on one can fail it.
 */
export function partJoiner(timeoutMs = PART_TIMEOUT_MS) {
  const open = new Map<string, Gathering>();
  return {
    add(part: PartMessage, now: number): string | undefined {
      const data = fromBase64url(part.data);
      if (!data || part.n >= part.of) return undefined;
      const entry = open.get(part.id) ?? { since: now, of: part.of, data: [] };
      if (entry.of !== part.of) return undefined;
      entry.data[part.n] = data;
      open.set(part.id, entry);
      const got = entry.data.filter(Boolean) as Uint8Array[];
      if (got.length < entry.of) return undefined;
      open.delete(part.id);
      const whole = new Uint8Array(got.reduce((size, piece) => size + piece.length, 0));
      let at = 0;
      for (const piece of got) {
        whole.set(piece, at);
        at += piece.length;
      }
      return new TextDecoder().decode(whole);
    },
    expire(now: number): string[] {
      const lost = [...open].filter(([, entry]) => now - entry.since > timeoutMs).map(([id]) => id);
      for (const id of lost) open.delete(id);
      return lost;
    },
  };
}
