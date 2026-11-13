import type { PhoneDetail, PhoneStep, ReplySegment } from '@mesa/core/phone';
import type { Outgoing } from '../compose/useSend';

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
  /** What the agent did in one gap between messages, oldest first: a run of steps, not a reply. */
  steps?: PhoneStep[];
  /** Opens a group: the other side spoke last, or long enough ago to show the time again. */
  first: boolean;
};

/** How long a pause starts a new group under the same speaker. */
const GROUP_GAP_MS = 10 * 60_000;

const opensGroup = (item: Omit<ChatItem, 'first'>, last?: Omit<ChatItem, 'first'>) =>
  !last ||
  last.from !== item.from ||
  (item.at !== null &&
    last.at !== null &&
    Date.parse(item.at) - Date.parse(last.at) > GROUP_GAP_MS);

type Reply = PhoneDetail['replies'][number];
/** One gap's steps, oldest first, timed as the reply they led to (none while still working). */
type Run = { run: PhoneStep[]; at: string | null };

/**
 * The Mac's replies (newest first) with the agent's steps between them: each gap's steps as one
 * run, after the replies newer than them and before that gap's prompts, which came first.
 */
function withSteps(replies: Reply[], steps: PhoneStep[]): (Reply | Run)[] {
  const gap = (newer: number, at: string | null) => {
    const run = steps.filter((step) => step.newer === newer).reverse();
    return run.length ? [{ run, at }] : [];
  };
  const out: (Reply | Run)[] = [...gap(0, null)];
  let agent = 0;
  for (const reply of replies) {
    out.push(reply);
    if (reply.from === 'agent') {
      agent += 1;
      out.push(...gap(agent, reply.at));
    }
  }
  return out;
}

/**
 * The conversation oldest first, so the newest sits at the bottom: the Mac's replies (sent newest
 * first) and the agent's steps among them (withSteps), then what this screen sent that the
 * transcript does not show yet, each marked where a group opens. A send the transcript already
 * holds (its text among the person's) is shown once.
 * ponytail: matched by text, so a second identical send hides once the first lands; match on
 * time if that ever matters.
 */
export function chatItems(
  replies: PhoneDetail['replies'],
  echoes: Outgoing[],
  steps: PhoneStep[] = [],
): ChatItem[] {
  const said = new Set(replies.filter((r) => r.from === 'you').map((r) => r.segments[0]?.text));
  const items: Omit<ChatItem, 'first'>[] = [
    ...withSteps(replies, steps)
      .reverse()
      .map((r) =>
        'run' in r
          ? // A run speaks for the agent, so it opens or joins the agent's group.
            {
              key: `steps:${r.run[0]?.id}`,
              from: 'agent' as const,
              at: r.at,
              segments: [],
              steps: r.run,
            }
          : {
              // Two replies with the same text share a revision, so the time tells them apart.
              key: `${r.from}:${r.id}:${r.at}`,
              from: r.from,
              at: r.at,
              segments: r.segments,
              ...(r.from === 'agent' ? { reply: r.id } : {}),
            },
      ),
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
