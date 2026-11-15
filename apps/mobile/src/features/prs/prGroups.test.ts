import type { PhonePr } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { bucketChoices, groupPrs } from './prGroups';

const pr = (number: number, bucket: string): PhonePr => ({
  project: 'tide-pool',
  number,
  title: `PR ${number}`,
  author: 'lee-park',
  branch: `b${number}`,
  bucket,
  updatedAt: '2026-11-12T10:00:00Z',
  url: `https://github.com/example/tide-pool/pull/${number}`,
});

test('PRs group in bucket order, empty buckets left out, an unknown one last', () => {
  const sections = groupPrs([pr(1, 'waiting'), pr(2, 'need'), pr(3, 'later'), pr(4, 'need')]);
  expect(sections.map((s) => [s.title, s.data.map((p) => p.number)])).toEqual([
    ['Needs your review', [2, 4]],
    ['Waiting on the author', [1]],
    ['Other', [3]],
  ]);
});

test('the bucket chips count each listed bucket under All; one bucket alone gives none', () => {
  const sections = groupPrs([pr(1, 'waiting'), pr(2, 'need'), pr(4, 'need')]);
  expect(bucketChoices(sections)).toEqual([
    { value: '', label: 'All', count: 3 },
    { value: 'need', label: 'To review', count: 2 },
    { value: 'waiting', label: 'Waiting', count: 1 },
  ]);
  expect(bucketChoices(groupPrs([pr(1, 'need')]))).toEqual([]);
});
