import { expect, test } from 'vitest';
import { citedParts, spanBuckets } from './cloudLines';

const entry = (time: string, severity: string) => ({
  project: 'tide-tables-123',
  fields: {},
  id: time,
  time,
  severity,
  service: 'tide-api',
  message: 'm',
  trace: null,
});

test('an answer splits into text and the cited ids only', () => {
  expect(citedParts('Fails [aa11] and [zz] or [bb22].', new Set(['aa11', 'bb22']))).toEqual([
    { text: 'Fails ' },
    { id: 'aa11' },
    { text: ' and ' },
    { text: '[zz]' },
    { text: ' or ' },
    { id: 'bb22' },
    { text: '.' },
  ]);
});

test("the Explorer's histogram spans the entries read: a minute of them in 2 s bars, not one bar on an hour", () => {
  const read = Array.from({ length: 60 }, (_, i) =>
    entry(
      new Date(Date.parse('2026-05-06T07:00:00Z') + i * 1000).toISOString(),
      i % 10 ? 'INFO' : 'ERROR',
    ),
  );
  const { buckets, stepMs, from, to } = spanBuckets(read);
  expect(stepMs).toBe(2000);
  expect(buckets).toHaveLength(30);
  expect(from).toBe(Date.parse('2026-05-06T07:00:00Z'));
  expect(to).toBe(Date.parse('2026-05-06T07:01:00Z'));
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(60);
  expect(buckets.reduce((n, b) => n + b.errors, 0)).toBe(6);
  expect(spanBuckets([]).buckets).toEqual([]);
});
