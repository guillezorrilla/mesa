import { expect, test } from 'vitest';
import { ctrlKeyOf } from './ctrlKey';

test('a letter typed while Ctrl is held is that Ctrl key; anything else is typed as it is', () => {
  expect(ctrlKeyOf('', 'c')).toBe('C-c');
  expect(ctrlKeyOf('git', 'gitD')).toBe('C-d');
  expect(ctrlKeyOf('', '1')).toBeUndefined();
  expect(ctrlKeyOf('ab', 'a')).toBeUndefined();
  expect(ctrlKeyOf('', 'ls')).toBeUndefined();
});
