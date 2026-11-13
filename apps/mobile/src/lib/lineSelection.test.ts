import { expect, test } from 'vitest';
import { isSelected, tapLine } from './lineSelection';

test('a tap picks a line, a second stretches to it either way, a third starts over', () => {
  const one = tapLine(undefined, 4);
  expect(one).toEqual({ start: 4, end: 4 });
  expect(tapLine(one, 9)).toEqual({ start: 4, end: 9 });
  expect(tapLine(one, 1)).toEqual({ start: 1, end: 4 });
  expect(tapLine({ start: 1, end: 4 }, 7)).toEqual({ start: 7, end: 7 });
  expect(tapLine(one, 4)).toBeUndefined();
  expect([3, 4, 9, 10].map((at) => isSelected({ start: 4, end: 9 }, at))).toEqual([
    false,
    true,
    true,
    false,
  ]);
});
