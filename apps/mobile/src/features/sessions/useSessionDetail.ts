import { MacCallError, type PhoneDetail, type UpdateMessage } from '@mesa/core/phone';
import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';
import { offlineText } from './offlineText';

/** A session's screen data as last read, and why the latest read failed: the last detail stays shown. */
export type DetailRead = { detail?: PhoneDetail; error?: string };

/** How often an open session screen asks again, for its replies and output as it works. */
const EVERY_MS = 5000;

const read = (link: MacLink, id: string, last?: Promise<DetailRead>): Promise<DetailRead> =>
  link.call({ method: 'session', id }).then(
    (detail) => ({ detail }),
    async (error: Error) => ({
      ...(await last),
      // A Mac that does not answer is offline, as the Agents tab says; its own error is its words.
      error:
        error instanceof MacCallError && error.reason !== 'failed'
          ? offlineText(await link.lastHeard(), Date.now())
          : error.message,
    }),
  );

/**
 * One session's detail as a promise to `use()`, read again every 5 s and on its row's update;
 * `again` reads it now, after the phone changed it.
 */
export function useSessionDetail(id: string) {
  const link = useMac();
  const [detail, setDetail] = useState(() => read(link, id));
  // The promise is made here, not in an updater: React may run an updater again while it
  // suspends, and each run would ask the Mac again.
  const again = () => {
    const next = read(link, id, detail);
    startTransition(() => setDetail(next));
  };
  useRepeatWhileActive(EVERY_MS, again);
  const onUpdate = useEffectEvent((update: UpdateMessage) => {
    if (update.rows.some((row) => row.id === id)) again();
  });
  useEffect(() => link.onUpdate(onUpdate), [link]);
  return { read: detail, again };
}
