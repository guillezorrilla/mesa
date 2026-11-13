import { expect, test } from 'vitest';
import { badgeText } from './badgeText';

test('a badge shows nothing at zero, the count, and 99+ past 99', () => {
  expect(badgeText(0)).toBeUndefined();
  expect(badgeText(1)).toBe('1');
  expect(badgeText(99)).toBe('99');
  expect(badgeText(100)).toBe('99+');
});
