import { expect, test } from 'vitest';
import { reviewText } from './reviewText';

test('with no review session, the bucket and Start or Re-review', () => {
  expect(reviewText({ bucket: 'need', drafts: [], review: null })).toEqual({
    say: 'Needs your review.',
    action: 'Start review...',
  });
  expect(reviewText({ bucket: 'updated', drafts: [], review: null }).action).toBe('Re-review...');
  expect(reviewText({ bucket: 'done', drafts: [], review: null }).say).toBe(
    'Nothing to do: you approved it, or it is merged or closed.',
  );
});

test('a live review session is opened, and waiting drafts are counted', () => {
  const draft = { id: 'D1', path: null, line: null, body: 'ok' };
  expect(
    reviewText({
      bucket: 'need',
      drafts: [draft, { ...draft, id: 'D2' }],
      review: { session: 'r1', mode: 'drafts', working: true },
    }),
  ).toEqual({
    say: 'A review session is at work, leaving drafts. 2 draft comments wait for you to submit.',
    action: 'Open the review session',
  });
});
