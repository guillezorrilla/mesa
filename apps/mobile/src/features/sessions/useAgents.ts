import type { PhoneRow, UpdateMessage } from '@mesa/core/phone';
import { startTransition, useEffect, useState, useTransition } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useGates } from '../gates/useGates';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';

/**
 * The Mac's rows as last listed and when; when that ask went unanswered, the last rows kept and
 * when the Mac was last heard.
 */
export type Listing = { rows: PhoneRow[]; at: number; offline?: { heardAt?: number } };
type Update = UpdateMessage & { at: number };

/** Asking for the rows also keeps the Mac's updates coming for two minutes (WATCH_MS). */
const RENEW_MS = 60_000;

/** Updates older than this are in a listing since (one comes every RENEW_MS), so they go. */
const KEEP_MS = 3 * RENEW_MS;
const fresh = (update: Update) => Date.now() - update.at < KEEP_MS;

const list = (link: MacLink, last?: Promise<Listing>): Promise<Listing> =>
  link.read({ method: 'sessions' }).then(
    ({ rows }) => ({ rows, at: Date.now() }),
    async () => ({
      rows: (await last)?.rows ?? [],
      at: Date.now(),
      offline: { heardAt: await link.lastHeard() },
    }),
  );

/**
 * The Agents tab's data: the listing as a promise to `use()`, the updates the Mac pushed since,
 * the open decision gates (useGates), a refresh (pull, and every minute in front, which keeps the
 * updates coming), and marking a session read or unread, shown at once.
 */
export function useAgents() {
  const link = useMac();
  const [listing, setListing] = useState(() => list(link));
  const [updates, setUpdates] = useState<Update[]>([]);
  const [refreshing, startRefresh] = useTransition();
  const open = useGates();

  useEffect(
    () =>
      link.onUpdate((update) =>
        setUpdates((all) => [...all.filter(fresh), { ...update, at: Date.now() }]),
      ),
    [link],
  );
  // The promise is made here, not in an updater, which React may run again while it suspends.
  const relist = (start: typeof startTransition) => {
    const next = list(link, listing);
    start(() => setListing(next));
  };
  const refresh = () => {
    relist(startRefresh);
    open.refresh();
  };
  useRepeatWhileActive(RENEW_MS, () => relist(startTransition));

  const mark = (row: PhoneRow, unread: boolean) => {
    setUpdates((all) => [
      ...all.filter(fresh),
      { kind: 'update', rows: [{ ...row, unread }], gone: [], order: [], at: Date.now() },
    ]);
    link.call({ method: 'mark', id: row.id, unread }).catch(refresh);
  };
  return { listing, updates, gates: open.gates, refreshing, refresh, mark };
}
