import { expect, test } from 'vitest';
import { shortAgo, timeAgo } from './ago.js';

const now = Date.parse('2026-09-30T12:00:00.000Z');

test('a recent time reads as how long ago it was', () => {
  expect(timeAgo('2026-09-30T11:59:40.000Z', now)).toBe('just now');
  expect(timeAgo('2026-09-30T11:15:00.000Z', now)).toBe('45m ago');
  expect(timeAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h ago');
  expect(timeAgo('2026-09-23T10:00:00.000Z', now)).toBe(
    new Date('2026-09-23T10:00:00.000Z').toLocaleDateString(),
  );
});

test('the short form counts days up to a month', () => {
  expect(shortAgo('2026-09-30T11:59:40.000Z', now)).toBe('now');
  expect(shortAgo('2026-09-30T11:15:00.000Z', now)).toBe('45m');
  expect(shortAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h');
  expect(shortAgo('2026-09-26T12:00:00.000Z', now)).toBe('4d');
  expect(shortAgo('2026-08-01T12:00:00.000Z', now)).toBe(
    new Date('2026-08-01T12:00:00.000Z').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  );
});
