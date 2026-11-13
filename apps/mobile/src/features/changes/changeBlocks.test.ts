import { expect, test } from 'vitest';
import { changeBlocks } from './changeBlocks';

test('the meter shares five blocks between added and removed lines', () => {
  expect(changeBlocks(20_000, 0)).toEqual(['add', 'add', 'add', 'add', 'add']);
  expect(changeBlocks(2, 1)).toEqual(['add', 'add', 'del', 'none', 'none']);
  expect(changeBlocks(0, 1)).toEqual(['del', 'none', 'none', 'none', 'none']);
  expect(changeBlocks(1, 300)).toEqual(['add', 'del', 'del', 'del', 'del']);
  expect(changeBlocks(300, 1)).toEqual(['add', 'add', 'add', 'add', 'del']);
  expect(changeBlocks(0, 0)).toEqual(['none', 'none', 'none', 'none', 'none']);
});
