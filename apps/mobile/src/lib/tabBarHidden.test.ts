import { expect, test } from 'vitest';
import { tabBarHidden } from './tabBarHidden';

test('the tab bar hides on a session, a diff, a quote and the new session form, whose bars sit where it would', () => {
  expect(tabBarHidden(['agents', '[id]'])).toBe(true);
  expect(tabBarHidden(['agents', 'start'])).toBe(true);
  expect(tabBarHidden(['agents', 'history'])).toBe(false);
  expect(tabBarHidden(['agents'])).toBe(false);
  expect(tabBarHidden(['agents', 'diff'])).toBe(true);
  expect(tabBarHidden(['agents', 'quote'])).toBe(true);
  expect(tabBarHidden(['agents', 'changes', '[id]'])).toBe(false);
  expect(tabBarHidden(['(home)', 'about'])).toBe(false);
  expect(tabBarHidden(['vault', 'decide'])).toBe(true);
  expect(tabBarHidden(['vault', 'note'])).toBe(false);
});
