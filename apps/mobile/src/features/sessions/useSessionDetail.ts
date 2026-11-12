import type { PhoneDetail, UpdateMessage } from '@mesa/core/phone';
import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';

/** A session's screen data as last read, or why it could not be: the last detail stays shown. */
export type DetailRead = { detail?: PhoneDetail; error?: string };

/** How often an open session screen asks again, for its replies and output as it works. */
const EVERY_MS = 5000;

const read = (link: MacLink, id: string, last?: Promise<DetailRead>): Promise<DetailRead> =>
  link.call({ method: 'session', id }).then(
    (detail) => ({ detail }),
    async (error: Error) => ({ ...(await last), error: error.message }),
  );

/** One session's detail as a promise to `use()`, read again every 5 s and on its row's update. */
export function useSessionDetail(id: string) {
  const link = useMac();
  const [detail, setDetail] = useState(() => read(link, id));
  const again = () => startTransition(() => setDetail((last) => read(link, id, last)));
  useRepeatWhileActive(EVERY_MS, again);
  const onUpdate = useEffectEvent((update: UpdateMessage) => {
    if (update.rows.some((row) => row.id === id)) again();
  });
  useEffect(() => link.onUpdate(onUpdate), [link]);
  return detail;
}
