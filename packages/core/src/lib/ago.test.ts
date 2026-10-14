import { expect, test } from 'vitest';
import { relativeAgo, shortAgo, timeAgo } from './ago.js';

const now = Date.parse('2026-09-30T12:00:00.000Z');

test('a recent time reads as how long ago it was', () => {
  expect(timeAgo('2026-09-30T11:59:40.000Z', now)).toBe('just now');
  expect(timeAgo('2026-09-30T11:15:00.000Z', now)).toBe('45m ago');
  expect(timeAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h ago');
  expect(timeAgo('2026-09-23T10:00:00.000Z', now)).toBe(
    new Date('2026-09-23T10:00:00.000Z').toLocaleDateString(),
  );
});

test('the relative form stays relative past a day', () => {
  expect(relativeAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h ago');
  expect(relativeAgo('2026-09-28T12:00:00.000Z', now)).toBe('2d ago');
  expect(relativeAgo('2026-09-09T12:00:00.000Z', now)).toBe('3w ago');
  expect(relativeAgo('2026-05-30T12:00:00.000Z', now)).toBe('4mo ago');
  expect(relativeAgo('2024-09-30T12:00:00.000Z', now)).toBe('2y ago');
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
