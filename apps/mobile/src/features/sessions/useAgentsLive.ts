import type { PhoneRow } from '@mesa/core/phone';
import { startTransition, useEffect, useState, useTransition } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useGates } from '../gates/useGates';
import type { Mac } from '../mac/macsContext';
import { rememberMac } from '../mac/sessionMacs';
import { useMacs } from '../mac/useMacs';
import type { Listing, MacUpdate, OnMac } from './agentRows';

/** Asking for the rows also keeps the Mac's updates coming for two minutes (WATCH_MS). */
const RENEW_MS = 60_000;

/** Updates older than this are in a listing since (one comes every RENEW_MS), so they go. */
const KEEP_MS = 3 * RENEW_MS;
const fresh = (update: MacUpdate) => Date.now() - update.at < KEEP_MS;

/** One Mac's rows, its sessions remembered as its own; the last rows kept when it does not answer. */
const list = (mac: Mac, last?: Listing): Promise<Listing> =>
  mac.link.read({ method: 'sessions' }).then(
    ({ rows }) => {
      rememberMac(
        mac.id,
        rows.map((row) => row.id),
      );
      return { mac: mac.id, rows, at: Date.now() };
    },
    async () => ({
      mac: mac.id,
      rows: last?.rows ?? [],
      at: Date.now(),
      offline: { heardAt: await mac.link.lastHeard() },
    }),
  );

/** Every Mac's listing at once, each keeping its own last rows. */
const listAll = async (macs: Mac[], last?: Promise<Listing[]>) => {
  const before = await last;
  return Promise.all(
    macs.map((mac) =>
      list(
        mac,
        before?.find((listing) => listing.mac === mac.id),
      ),
    ),
  );
};

/**
 * The Agents tab's data over every paired Mac, held once above the tabs (AgentsProvider) so the
 * tab's badge counts what the screen shows: their listings as a promise to `use()`, the updates
 * each pushed since, the open decision gates (useGates), a refresh (pull, and every minute in
 * front, which keeps the updates coming), and marking a session read or unread or archiving it
 * on its own Mac, shown at once.
 */
export function useAgentsLive() {
  const macs = useMacs();
  const ids = macs.map((mac) => mac.id).join();
  const [listing, setListing] = useState(() => listAll(macs));
  // A Mac paired or unpaired is listed (or dropped) at once, not at the next minute's relist.
  const [listedFor, setListedFor] = useState(ids);
  if (listedFor !== ids) {
    setListedFor(ids);
    setListing(listAll(macs, listing));
  }
  const [updates, setUpdates] = useState<MacUpdate[]>([]);
  const [refreshing, startRefresh] = useTransition();
  const open = useGates();

  useEffect(() => {
    const stops = macs.map((mac) =>
      mac.link.onUpdate((update) =>
        setUpdates((all) => [...all.filter(fresh), { ...update, mac: mac.id, at: Date.now() }]),
      ),
    );
    return () => {
      for (const stop of stops) stop();
    };
  }, [macs]);
  // The promise is made here, not in an updater, which React may run again while it suspends.
  const relist = (start: typeof startTransition) => {
    const next = listAll(macs, listing);
    start(() => setListing(next));
  };
  const refresh = () => {
    relist(startRefresh);
    open.refresh();
  };
  useRepeatWhileActive(RENEW_MS, () => relist(startTransition));

  /** Shows `update` to the row's list at once, then asks its Mac; a refusal relists. */
  const showThenAsk = (
    row: OnMac<PhoneRow>,
    update: Pick<MacUpdate, 'rows' | 'gone'>,
    call: (link: Mac['link']) => Promise<unknown>,
  ) => {
    setUpdates((all) => [
      ...all.filter(fresh),
      { kind: 'update', mac: row.mac, ...update, order: [], at: Date.now() },
    ]);
    const mac = macs.find((one) => one.id === row.mac);
    if (!mac) return refresh();
    call(mac.link).catch(refresh);
  };
  const mark = (row: OnMac<PhoneRow>, unread: boolean) =>
    showThenAsk(row, { rows: [{ ...row, unread }], gone: [] }, (link) =>
      link.call({ method: 'mark', id: row.id, unread }),
    );
  const archive = (row: OnMac<PhoneRow>) =>
    showThenAsk(row, { rows: [], gone: [row.id] }, (link) =>
      link.call({ method: 'act', id: row.id, action: 'archive' }),
    );
  return {
    macs,
    listing,
    updates,
    gates: open.gates,
    refreshGates: open.refresh,
    refreshing,
    refresh,
    mark,
    archive,
  };
}
