import type { TreeRow } from '@mesa/core';
import { reviewsOf } from '@mesa/core/browser';
import type { PrRef } from '@/lib/client/prs';
import { prKey } from './prKey';

/** The board's managed rows, the ones that can be review sessions. */
const managed = (rows: readonly TreeRow[]) => rows.flatMap((row) => (row.managed ? [row] : []));

/** The board's review sessions of `pr`, oldest round first, and the live one, opened not restarted. */
export const reviewSessionsOf = (rows: readonly TreeRow[], pr: PrRef) =>
  reviewsOf(managed(rows), pr.project, pr.number, (row) => row.alive);

/** The key (prKey) of every PR a live review session works on, for the list's Reviewing tag. */
export const liveReviews = (rows: readonly TreeRow[]) =>
  new Set(
    managed(rows).flatMap((row) =>
      row.alive && row.review && row.project
        ? [prKey({ project: row.project, number: row.review.pr })]
        : [],
    ),
  );
