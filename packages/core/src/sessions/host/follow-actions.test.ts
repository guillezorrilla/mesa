import { expect, test } from 'vitest';
import { followedSession } from './follow-actions.js';

test('a chat action names its session after --, another command none', () => {
  expect(followedSession(['--json', 'send', '--no-from', '--', 'a1b2c3d4', 'hi'])).toBe('a1b2c3d4');
  expect(followedSession(['sessions', 'model', '--effort=low', '--', 'a1b2c3d4'])).toBe('a1b2c3d4');
  expect(
    followedSession(['--json', 'sessions', 'view', '--', 'a1b2c3d4', 'terminal']),
  ).toBeUndefined();
  expect(followedSession(['--json', 'rename', '--', 'a1b2c3d4', 'x'])).toBeUndefined();
  expect(followedSession(['--json', 'send', 'a1b2c3d4', 'hi'])).toBeUndefined();
});
