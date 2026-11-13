import { expect, test } from 'vitest';
import { barShares, dayInitial } from './usageText';

test("a day reads as its weekday's initial and its bar as a share of the highest", () => {
  expect(dayInitial('2026-11-12')).toBe('T');
  expect(dayInitial('2026-11-15')).toBe('S');
  expect(barShares([2, null, 1, 0])).toEqual([1, 0, 0.5, 0]);
  expect(barShares([null, 0])).toEqual([0, 0]);
});
