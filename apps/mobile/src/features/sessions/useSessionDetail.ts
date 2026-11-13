import { type PhoneDetail, SESSION_REPLIES, type UpdateMessage } from '@mesa/core/phone';
import { startTransition, useEffect, useEffectEvent, useState, useTransition } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { keepLast, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';

/** A session's screen data as last read, and why the latest read failed: the last detail stays shown. */
export type DetailRead = { detail?: PhoneDetail; error?: string };

/** How often an open session screen asks again, for its replies and output as it works. */
const EVERY_MS = 5000;

/** How many of the agent's replies the screen asks for first, and how many more each time. */
const PAGE = 10;

const read = async (
  link: MacLink,
  id: string,
  replies: number,
  last?: Promise<DetailRead>,
): Promise<DetailRead> => {
  const next = await tryCall(link, () => link.read({ method: 'session', id, replies }));
  return keepLast(next.error ? { error: next.error } : { detail: next.result }, last);
};

/**
 * One session's detail as a promise to `use()`, read again every 5 s and on its row's update;
 * `again` reads it now, after the phone changed it, and `older` asks for more of its replies.
 */
export function useSessionDetail(id: string) {
  const link = useMac();
  const [count, setCount] = useState(PAGE);
  const [detail, setDetail] = useState(() => read(link, id, PAGE));
  const [loadingOlder, startOlder] = useTransition();
  // The promise is made here, not in an updater: React may run an updater again while it
  // suspends, and each run would ask the Mac again.
  const again = () => {
    const next = read(link, id, count, detail);
    startTransition(() => setDetail(next));
  };
  const older = () => {
    const more = Math.min(count + PAGE, SESSION_REPLIES.most);
    if (more === count || loadingOlder) return;
    const next = read(link, id, more, detail);
    startOlder(() => {
      setCount(more);
      setDetail(next);
    });
  };
  useRepeatWhileActive(EVERY_MS, again);
  const onUpdate = useEffectEvent((update: UpdateMessage) => {
    if (update.rows.some((row) => row.id === id)) again();
  });
  useEffect(() => link.onUpdate(onUpdate), [link]);
  return { read: detail, again, older, loadingOlder, atMost: count >= SESSION_REPLIES.most };
}

/** A session screen's reads: the detail to `use()`, reading it again, and paging older replies. */
export type SessionDetail = ReturnType<typeof useSessionDetail>;
