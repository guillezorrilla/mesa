import { expect, test } from 'vitest';
import { citedParts, cloudBuckets } from './cloudLines';

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

test('buckets count entries per 5 minutes over the range, errors apart, oldest first', () => {
  const now = Date.parse('2026-05-06T07:12:00Z');
  const buckets = cloudBuckets(
    [
      entry('2026-05-06T07:11:00Z', 'ERROR'),
      entry('2026-05-06T07:10:30Z', 'INFO'),
      entry('2026-05-06T06:16:00Z', 'CRITICAL'),
      entry('2026-05-06T05:00:00Z', 'ERROR'),
      entry('', 'ERROR'),
    ],
    3_600_000,
    now,
  );
  expect(buckets).toHaveLength(12);
  expect(new Date(buckets[0]?.start ?? 0).toISOString()).toBe('2026-05-06T06:15:00.000Z');
  expect(buckets[0]).toMatchObject({ count: 1, errors: 1 });
  expect(buckets.at(-1)).toMatchObject({ count: 2, errors: 1 });
  expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
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
