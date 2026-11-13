import { type PhoneDetail, REWATCH_MS, SESSION_REPLIES } from '@mesa/core/phone';
import { startTransition, useState, useTransition } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { keepLast, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useMacUpdates } from '../mac/useMacUpdates';
import { useSessionWatch } from './useSessionWatch';

/** A session's screen data as last read, and why the latest read failed: the last detail stays shown. */
export type DetailRead = { detail?: PhoneDetail; error?: string };

/** How often an open session screen asks again when its Mac does not push it (an older Mac). */
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
 * One session's detail as a promise to `use()`, as the Mac pushes it while the screen is open
 * (useSessionWatch), read again every minute; from an older Mac, read every 5 s and on its row's
 * update. `again` reads it now, after the phone changed it, `older` asks for more of its replies,
 * and `pushed` says whether the Mac pushes it.
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
  const pushed = useSessionWatch(id, count);
  useRepeatWhileActive(pushed ? REWATCH_MS : EVERY_MS, again);
  useMacUpdates((update) => {
    const watched = update.watched?.find((each) => each.id === id)?.detail;
    if (watched) {
      const next = Promise.resolve({ detail: watched });
      startTransition(() => setDetail(next));
    } else if (!pushed && update.rows.some((row) => row.id === id)) again();
  });
  return {
    read: detail,
    again,
    older,
    loadingOlder,
    atMost: count >= SESSION_REPLIES.most,
    pushed,
  };
}

/** A session screen's reads: the detail to `use()`, reading it again, and paging older replies. */
export type SessionDetail = ReturnType<typeof useSessionDetail>;
