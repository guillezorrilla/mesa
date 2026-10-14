import type { TreeRow } from '@mesa/core';
import type { PrRef } from '@/lib/client/prs';

/** A review session of a PR as the Reviews screens read it from the board's rows. */
export type ReviewSession = {
  id: string;
  alive: boolean;
  review: NonNullable<Extract<TreeRow, { managed: true }>['review']>;
};

/** The board's review sessions of `pr`, oldest round first; a live one is opened, not started again. */
export const reviewSessionsOf = (rows: readonly TreeRow[], pr: PrRef): ReviewSession[] =>
  rows
    .flatMap((row) =>
      row.managed && row.project === pr.project && row.review?.pr === pr.number
        ? [{ id: row.id, alive: row.alive, review: row.review }]
        : [],
    )
    .sort((a, b) => a.review.round - b.review.round);

/** `project#number` of every PR a live review session works on, for the list's Reviewing tag. */
export const liveReviews = (rows: readonly TreeRow[]) =>
  new Set(
    rows.flatMap((row) =>
      row.managed && row.alive && row.review && row.project
        ? [`${row.project}#${row.review.pr}`]
        : [],
    ),
  );
