import { expect, test } from 'vitest';
import { attentionScore, contextPercent, duration, listPrice, percent } from './format.js';

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

test('a confidence, an attention score, and a context reading read the same everywhere', () => {
  expect(percent(0.954)).toBe('95%');
  expect(attentionScore(0.8333)).toBe('0.83');
  expect([21.16, 54.5, 120, -3].map(contextPercent)).toEqual([21, 55, 100, 0]);
});
