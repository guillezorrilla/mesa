import type { PrRow, TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { liveReviews, stillReviewing } from './reviewSessions';

const session = (startedAt: string, alive = true) =>
  ({
    managed: true,
    alive,
    project: 'shop',
    startedAt,
    review: { pr: 7, round: 1, mode: 'drafts', head: 'abc' },
  }) as unknown as TreeRow;

const pr = (lastWord: string | null) =>
  ({ project: 'shop', number: 7, bucket: 'updated', since: { lastWord } }) as unknown as PrRow;

test('a live review session tags its PR until I post my review', () => {
  const live = liveReviews([session('2026-01-01T10:00:00.000Z')]);
  expect(stillReviewing(live, pr(null))).toBe(true);
  expect(stillReviewing(live, pr('2026-01-01T09:00:00.000Z'))).toBe(true);
  // Posted after the session started: the round is over though the session stays open.
  expect(stillReviewing(live, pr('2026-01-01T11:00:00.000Z'))).toBe(false);
});

test('a new round started after my last review tags it again; a stopped one never does', () => {
  const rounds = [session('2026-01-01T10:00:00.000Z'), session('2026-01-01T12:00:00.000Z')];
  expect(stillReviewing(liveReviews(rounds), pr('2026-01-01T11:00:00.000Z'))).toBe(true);
  const stopped = liveReviews([session('2026-01-01T12:00:00.000Z', false)]);
  expect(stillReviewing(stopped, pr(null))).toBe(false);
});
