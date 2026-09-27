import { expect, test } from 'vitest';
import { claudeHookState as hookState } from './hook-state.js';

test('a SessionEnd from /clear or /resume gives no state: the agent goes on; any other is done', () => {
  expect(hookState('SessionEnd', { reason: 'clear' })).toBeUndefined();
  expect(hookState('SessionEnd', { reason: 'resume' })).toBeUndefined();
  expect(hookState('SessionEnd', { reason: 'prompt_input_exit' })).toBe('done');
  expect(hookState('SessionEnd', { reason: 'other' })).toBe('done');
  expect(hookState('SessionEnd')).toBe('done');
});
