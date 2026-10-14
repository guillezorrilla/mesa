import { expect, test } from 'vitest';
import { bucketOf, type PrFacts } from './buckets.js';

// Dana opened the PR; I am "ana". Times are on one invented day.
const pr = (over: Partial<PrFacts> = {}): PrFacts => ({
  author: 'dana',
  state: 'open',
  requested: false,
  reviews: [],
  comments: [],
  commits: ['2026-10-01T09:00:00Z'],
  threads: [],
  ...over,
});
const myReview = (at: string, state: 'approved' | 'changes' | 'commented' = 'changes') => ({
  author: 'ana',
  state,
  at,
});

test('requested and not reviewed yet: needs my review', () => {
  expect(bucketOf(pr({ requested: true }), 'ana').bucket).toBe('need');
});

test('neither requested nor touched by me: not for me', () => {
  expect(bucketOf(pr(), 'ana').bucket).toBe('other');
});

test('commits after my review: updated, with the evidence', () => {
  const got = bucketOf(
    pr({
      requested: true,
      reviews: [myReview('2026-10-01T10:00:00Z')],
      commits: ['2026-10-01T09:00:00Z', '2026-10-01T11:00:00Z', '2026-10-01T12:00:00Z'],
      comments: [
        { author: 'ana', at: '2026-10-01T10:00:00Z' },
        { author: 'dana', at: '2026-10-01T09:30:00Z' },
        { author: 'dana', at: '2026-10-01T11:30:00Z' },
        { author: 'lee', at: '2026-10-01T11:40:00Z' },
      ],
      threads: [
        { author: 'ana', resolved: true },
        { author: 'ana', resolved: false },
        { author: 'lee', resolved: true },
      ],
    }),
    'ana',
  );
  expect(got).toEqual({
    bucket: 'updated',
    since: {
      lastWord: '2026-10-01T10:00:00.000Z',
      commits: 2,
      replies: 1,
      resolved: 1,
      threads: 2,
    },
  });
});

test('requested and only commented on: still needs my review', () => {
  const got = bucketOf(
    pr({ requested: true, comments: [{ author: 'ana', at: '2026-10-01T10:00:00Z' }] }),
    'ana',
  );
  expect(got.bucket).toBe('need');
});

test('an author reply after my comment alone makes it updated', () => {
  const got = bucketOf(
    pr({
      comments: [
        { author: 'ana', at: '2026-10-01T10:00:00Z' },
        { author: 'dana', at: '2026-10-01T10:05:00Z' },
      ],
    }),
    'ana',
  );
  expect(got.bucket).toBe('updated');
});

test('nothing since my review: waiting on the author', () => {
  expect(bucketOf(pr({ reviews: [myReview('2026-10-01T10:00:00Z')] }), 'ana').bucket).toBe(
    'waiting',
  );
});

test('approved with nothing new: done; new commits after approval: updated', () => {
  const approved = pr({ reviews: [myReview('2026-10-01T10:00:00Z', 'approved')] });
  expect(bucketOf(approved, 'ana').bucket).toBe('done');
  expect(
    bucketOf({ ...approved, commits: [...approved.commits, '2026-10-02T08:00:00Z'] }, 'ana').bucket,
  ).toBe('updated');
});

test('merged or closed: done', () => {
  expect(bucketOf(pr({ state: 'merged', requested: true }), 'ana').bucket).toBe('done');
  expect(bucketOf(pr({ state: 'closed', requested: true }), 'ana').bucket).toBe('done');
});
