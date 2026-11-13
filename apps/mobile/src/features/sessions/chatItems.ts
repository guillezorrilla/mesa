import type { PhoneDetail, ReplySegment } from '@mesa/core/phone';

/** One message in a session's conversation as the screen shows it, oldest first. */
export type ChatItem = {
  key: string;
  from: 'agent' | 'you';
  at: string | null;
  segments: ReplySegment[];
  /** The agent's reply's revision, to quote it. */
  reply?: string;
  /** Sent from this screen and still on its way. */
  sending?: boolean;
  /** Opens a group: the other side spoke last, or long enough ago to show the time again. */
  first: boolean;
};

/** A reply this screen sent, as the reply bar keeps it (useSend's Outgoing). */
type Echo = { key: string; text: string; photo: boolean; sending: boolean };

/** How long a pause starts a new group under the same speaker. */
const GROUP_GAP_MS = 10 * 60_000;

const opensGroup = (item: Omit<ChatItem, 'first'>, last?: Omit<ChatItem, 'first'>) =>
  !last ||
  last.from !== item.from ||
  (item.at !== null &&
    last.at !== null &&
    Date.parse(item.at) - Date.parse(last.at) > GROUP_GAP_MS);

/**
 * The conversation oldest first, so the newest sits at the bottom: the Mac's replies (sent newest
 * first) and then what this screen sent that the transcript does not show yet, each marked where a
 * group opens. A send the transcript already holds (its text among the person's) is shown once.
 */
export function chatItems(replies: PhoneDetail['replies'], echoes: Echo[]): ChatItem[] {
  const said = new Set(replies.filter((r) => r.from === 'you').map((r) => r.segments[0]?.text));
  const items: Omit<ChatItem, 'first'>[] = [
    ...[...replies].reverse().map((r) => ({
      // Two replies with the same text share a revision, so the time tells them apart.
      key: `${r.from}:${r.id}:${r.at}`,
      from: r.from,
      at: r.at,
      segments: r.segments,
      ...(r.from === 'agent' ? { reply: r.id } : {}),
    })),
    ...echoes
      .filter((echo) => echo.sending || !said.has(echo.text))
      .map((echo) => ({
        key: `echo:${echo.key}`,
        from: 'you' as const,
        at: null,
        segments: [{ code: false, text: echo.photo ? `Photo. ${echo.text}` : echo.text }],
        sending: echo.sending,
      })),
  ];
  return items.map((item, index) => ({ ...item, first: opensGroup(item, items[index - 1]) }));
}

/** How many messages came after `seen`, the newest one shown when the person scrolled away. */
export function newSince(keys: string[], seen: string | undefined) {
  const at = seen === undefined ? -1 : keys.lastIndexOf(seen);
  return at < 0 ? 0 : keys.length - 1 - at;
}
