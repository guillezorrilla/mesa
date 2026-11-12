import type { PhoneRow, UpdateMessage } from '@mesa/core/phone';
import { startTransition, useEffect, useState, useTransition } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';

/** The Mac's rows as last listed, when, and whether that ask went unanswered (the last rows kept). */
export type Listing = { rows: PhoneRow[]; at: number; offline: boolean };
type Update = UpdateMessage & { at: number };

/** Asking for the rows also keeps the Mac's updates coming for two minutes (WATCH_MS). */
const RENEW_MS = 60_000;

const list = (link: MacLink, last?: Promise<Listing>): Promise<Listing> =>
  link.call({ method: 'sessions' }).then(
    ({ rows }) => ({ rows, at: Date.now(), offline: false }),
    async () => ({ rows: (await last)?.rows ?? [], at: Date.now(), offline: true }),
  );

/**
 * The Agents tab's data: the listing as a promise to `use()`, the updates the Mac pushed since,
 * a refresh (pull, and every minute in front, which keeps the updates coming), and marking a
 * session read or unread, shown at once.
 */
export function useAgents() {
  const link = useMac();
  const [listing, setListing] = useState(() => list(link));
  const [updates, setUpdates] = useState<Update[]>([]);
  const [refreshing, startRefresh] = useTransition();

  useEffect(
    () => link.onUpdate((update) => setUpdates((all) => [...all, { ...update, at: Date.now() }])),
    [link],
  );
  const refresh = () => startRefresh(() => setListing((last) => list(link, last)));
  useRepeatWhileActive(RENEW_MS, () =>
    startTransition(() => setListing((last) => list(link, last))),
  );

  const mark = (row: PhoneRow, unread: boolean) => {
    setUpdates((all) => [
      ...all,
      { kind: 'update', rows: [{ ...row, unread }], gone: [], at: Date.now() },
    ]);
    link.call({ method: 'mark', id: row.id, unread }).catch(refresh);
  };
  return { listing, updates, refreshing, refresh, mark, heardAt: () => link.heardAt };
}
