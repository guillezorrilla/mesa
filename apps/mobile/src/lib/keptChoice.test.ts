import { expect, test } from 'vitest';
import { ALL, keptChoice } from './keptChoice';

test('a kept choice holds while it is offered; none, or one gone, is All', () => {
  const choices = [{ value: ALL }, { value: 'sprint' }];
  expect(keptChoice(choices, 'sprint')).toBe('sprint');
  expect(keptChoice(choices, undefined)).toBe(ALL);
  expect(keptChoice(choices, 'gone')).toBe(ALL);
  expect(keptChoice([], 'sprint')).toBe(ALL);
});
