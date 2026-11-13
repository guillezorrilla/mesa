import { expect, test } from 'vitest';
import {
  duration,
  excludedNote,
  formatBytes,
  listPrice,
  money,
  odds,
  percent,
  usd,
} from './format.js';

test('durations and list prices read the same everywhere', () => {
  expect([0, 42, 60, 303, 3600, 7620].map(duration)).toEqual([
    '0s',
    '42s',
    '1m00s',
    '5m03s',
    '1h00m',
    '2h07m',
  ]);
  expect(listPrice(0.01234)).toBe(' (list price $0.0123)');
  expect(listPrice(undefined)).toBe('');
});

test('a confidence reads the same everywhere', () => {
  expect(percent(0.954)).toBe('95%');
});

test('dollars read to the places a site shows, or in full', () => {
  expect(usd(0.012345, 4)).toBe('$0.0123');
  expect(usd(5, 2)).toBe('$5.00');
  expect(usd(0.000167)).toBe('$0.000167');
  expect(money(1.234)).toBe('$1.23');
  expect(money(0.004)).toBe('<$0.01');
  expect(money(0)).toBe('$0.00');
  expect(money(null)).toBe('Unknown');
  expect([0, 1, 2].map(excludedNote)).toEqual(['', 'excludes 1 session', 'excludes 2 sessions']);
});

test("Faro's odds read to two places", () => {
  expect([0.8, 0.125, 1].map(odds)).toEqual(['0.80', '0.13', '1.00']);
});

test('sizes on disk read in powers of 1,000, one decimal past bytes', () => {
  expect([512, 5_242_880, 12_300_000_000, 999_960].map(formatBytes)).toEqual([
    '512 B',
    '5.2 MB',
    '12.3 GB',
    '1.0 MB',
  ]);
});
