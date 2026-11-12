// A notice: what a push carries for the phone (#1016), sealed Mac to phone like a box but outside
// the mailbox, so it has no seq. The broker sends it as the push's `n` without opening it; the
// phone's Notification Service Extension (apps/mobile/targets/notifications) opens it and shows
// `title` and `body` in place of the fixed alert. vectors.json holds one for the extension's tests.
import { z } from 'zod';
import { open, type SideKeys, seal } from './seal.js';

export type Notice = { title: string; body: string };

/** What a push says when the notice does not open, and which kind the broker is told. */
export type NoticeKind = 'input' | 'finished';

/** The longest sealed notice the broker takes, in base64url characters: well under APNs' 4 KB. */
export const NOTICE_MAX = 3072;
const TITLE_MAX = 120;
const BODY_MAX = 400;

// Control characters become spaces: JSON would escape each to six bytes and burst the bound.
const clip = (text: string, max: number) =>
  Array.from(text.replace(/\p{Cc}/gu, ' '))
    .slice(0, max)
    .join('');
const sealed = z.object({
  v: z.literal(1),
  kind: z.literal('notice'),
  title: z.string(),
  body: z.string(),
});

/** Seals a notice for the phone, its title and body clipped so the box stays under NOTICE_MAX. */
export const sealNotice = (keys: SideKeys, notice: Notice) =>
  seal(
    keys.seal,
    keys.pairingId,
    JSON.stringify({
      v: 1,
      kind: 'notice',
      title: clip(notice.title, TITLE_MAX),
      body: clip(notice.body, BODY_MAX),
    }),
  );

/** Opens a notice from `sealNotice`, or undefined when it is not one for these keys. */
export function openNotice(keys: SideKeys, box: string): Notice | undefined {
  const text = open(keys.open, keys.pairingId, box);
  if (text === undefined) return undefined;
  try {
    const { title, body } = sealed.parse(JSON.parse(text));
    return { title, body };
  } catch {
    return undefined;
  }
}
