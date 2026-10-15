import type { PrRow, TreeRow } from '@mesa/core';
import { reviewsOf } from '@mesa/core/browser';
import type { PrRef } from '@/lib/client/prs';
import { prKey } from './prKey';

/** The board's managed rows, the ones that can be review sessions. */
const managed = (rows: readonly TreeRow[]) => rows.flatMap((row) => (row.managed ? [row] : []));

/** The board's review sessions of `pr`, oldest round first, and the live one, opened not restarted. */
export const reviewSessionsOf = (rows: readonly TreeRow[], pr: PrRef) =>
  reviewsOf(managed(rows), pr.project, pr.number, (row) => row.alive);

/** The key (prKey) of every PR a live review session works on, with when the newest one started. */
export const liveReviews = (rows: readonly TreeRow[]) => {
  const live = new Map<string, string>();
  for (const row of managed(rows)) {
    if (!row.alive || !row.review || !row.project) continue;
    const key = prKey({ project: row.project, number: row.review.pr });
    const seen = live.get(key);
    if (!seen || Date.parse(row.startedAt) > Date.parse(seen)) live.set(key, row.startedAt);
  }
  return live;
};

/**
 * The list's Reviewing tag: a live review session works on `pr` and I have not had my word since
 * it started. Posting my review ends the round, though the session may stay open, so the PR's
 * own bucket (Updated, when the author answers) shows again.
 */
export const stillReviewing = (live: ReadonlyMap<string, string> | undefined, pr: PrRow) => {
  const started = live?.get(prKey(pr));
  if (!started) return false;
  return !pr.since.lastWord || Date.parse(pr.since.lastWord) < Date.parse(started);
};
