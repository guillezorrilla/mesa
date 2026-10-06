import { expect, test } from 'vitest';
import { duration, listPrice, percent } from './format.js';

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
