import { expect, test } from 'vitest';
import { tabBarHidden } from './tabBarHidden';

test('the tab bar hides on a session screen only', () => {
  expect(tabBarHidden(['agents', '[id]'])).toBe(true);
  expect(tabBarHidden(['agents'])).toBe(false);
  expect(tabBarHidden(['agents', 'diff'])).toBe(false);
  expect(tabBarHidden(['agents', 'changes', '[id]'])).toBe(false);
  expect(tabBarHidden(['(home)', 'about'])).toBe(false);
});
