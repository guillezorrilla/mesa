import { expect, test } from 'vitest';
import { groupOf, stateColor, stateWords } from './sessionState';

test('a state groups, reads and colours as Mesa shows it', () => {
  expect(groupOf('waiting-permission')).toBe('needs-you');
  expect(groupOf('queued')).toBe('working');
  expect(groupOf('some-new-state')).toBe('done');
  expect(stateWords('waiting-permission')).toBe('Asking permission');
  expect(stateWords('later')).toBe('later');
  expect(stateColor('idle', true)).toBe('bg-state-unread');
  expect(stateColor('idle')).toBe('bg-state-idle');
  expect(stateColor('failed')).toBe('bg-state-failed');
});
