import type { PhoneGate, PhoneRow, UpdateMessage } from '@mesa/core/phone';
import { GROUP_TITLES, type Group, groupOf } from './sessionState';

/** `mac` keeps one paired Mac's rows (its pairing id); none keeps every Mac's. */
export type RowFilter = { query: string; project?: string; mac?: string; unreadOnly: boolean };

/** A row, or an open gate, with the pairing of the Mac it came from. */
export type OnMac<T> = T & { mac: string };

/**
 * One Mac's rows as last listed and when; when that ask went unanswered, the last rows kept and
 * when the Mac was last heard.
 */
export type Listing = {
  mac: string;
  rows: PhoneRow[];
  at: number;
  offline?: { heardAt?: number };
};
export type MacUpdate = OnMac<UpdateMessage & { at: number }>;

/**
 * The listing with each update applied in order: changed rows in place, gone ids out, new ones
 * in, then the Mac's attention order when the update gives one (a mark made here gives none).
 */
export function applyUpdates(rows: readonly PhoneRow[], updates: readonly UpdateMessage[]) {
  let out = [...rows];
  for (const update of updates) {
    const changed = new Map(update.rows.map((row) => [row.id, row]));
    const gone = new Set(update.gone);
    out = out.filter((row) => !gone.has(row.id)).map((row) => changed.get(row.id) ?? row);
    const known = new Set(out.map((row) => row.id));
    out.push(...update.rows.filter((row) => !known.has(row.id)));
    if (!update.order.length) continue;
    const rank = new Map(update.order.map((id, index) => [id, index]));
    const last = update.order.length;
    out.sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
  }
  return out;
}

/**
 * Every Mac's rows as one list, in pairing order: each listing with the updates its Mac pushed
 * after it (applyUpdates), each row naming its Mac.
 */
export function mergeListings(listings: readonly Listing[], updates: readonly MacUpdate[]) {
  return listings.flatMap((listing) =>
    applyUpdates(
      listing.rows,
      updates.filter((update) => update.mac === listing.mac && update.at > listing.at),
    ).map((row) => ({ ...row, mac: listing.mac })),
  );
}

/**
 * The rows a filter keeps: the query in the title, the project or what a waiting one asks, the
 * project, the Mac, unread only.
 */
export function filterRows<R extends PhoneRow & { mac?: string }>(
  rows: readonly R[],
  filter: RowFilter,
) {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!query ||
        `${row.title} ${row.project ?? ''} ${row.ask ?? ''}`.toLowerCase().includes(query)) &&
      (!filter.project || row.project === filter.project) &&
      (!filter.mac || row.mac === filter.mac) &&
      (!filter.unreadOnly || row.unread),
  );
}

/** Newest first by when the row entered its state (the time it shows), then by id. */
const lastActiveFirst = (a: PhoneRow, b: PhoneRow) =>
  Date.parse(b.since) - Date.parse(a.since) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Needs you (open decision gates first, whatever the filter: each waits on the person), Working,
 * Done, each latest active first (lastActiveFirst), empty groups left out.
 */
export function groupRows<R extends PhoneRow, G extends PhoneGate>(
  rows: readonly R[],
  gates: readonly G[] = [],
) {
  const groups: Group[] = ['needs-you', 'working', 'done'];
  return groups
    .map((group) => ({
      key: group,
      title: GROUP_TITLES[group],
      data: [
        ...(group === 'needs-you' ? gates : ([] as G[])),
        ...rows.filter((row) => groupOf(row.state) === group).sort(lastActiveFirst),
      ],
    }))
    .filter((section) => section.data.length);
}

/** How many wait on the person, whatever the filter: Needs you as groupRows makes it. */
export const needsYouCount = (rows: readonly PhoneRow[], gates: readonly PhoneGate[]) =>
  groupRows(rows, gates).find((section) => section.key === 'needs-you')?.data.length ?? 0;

/** Whether a Needs you item is a decision gate rather than a session. */
export const isGate = (item: PhoneRow | PhoneGate): item is PhoneGate => 'question' in item;

/** The projects the rows name, sorted, for the project filter. */
export const projectsOf = (rows: readonly PhoneRow[]) =>
  [...new Set(rows.flatMap((row) => (row.project ? [row.project] : [])))].sort();

/** Where a row's session runs, as its row says it: its project, and its Mac among several. */
export const placeOf = (project: string | null, mac?: string) =>
  mac ? (project ? `${project} on ${mac}` : mac) : project;
