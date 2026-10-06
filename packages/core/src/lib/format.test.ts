import { expect, test } from 'vitest';
import { duration, listPrice, odds, percent, usd } from './format.js';

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
});

test("Faro's odds read to two places", () => {
  expect([0.8, 0.125, 1].map(odds)).toEqual(['0.80', '0.13', '1.00']);
});
