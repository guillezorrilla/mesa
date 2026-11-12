import { expect, test } from 'vitest';
import { barShares, dayInitial, money } from './usageText';

test('costs read as dollars, unknown when not priced', () => {
  expect(money(1.234)).toBe('$1.23');
  expect(money(0)).toBe('$0.00');
  expect(money(0.004)).toBe('<$0.01');
  expect(money(null)).toBe('unknown');
});

test("a day reads as its weekday's initial and its bar as a share of the highest", () => {
  expect(dayInitial('2026-11-12')).toBe('T');
  expect(dayInitial('2026-11-15')).toBe('S');
  expect(barShares([2, null, 1, 0])).toEqual([1, 0, 0.5, 0]);
  expect(barShares([null, 0])).toEqual([0, 0]);
});
