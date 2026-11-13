import { expect, test } from 'vitest';
import { macOf, rememberMac } from './sessionMacs';

test('a session seen in a Mac listing is found on that Mac; one never seen on none', () => {
  rememberMac('studio', ['a1b2c3d4', 'gate-1']);
  rememberMac('laptop', ['e5f6g7h8']);
  expect(macOf('a1b2c3d4')).toBe('studio');
  expect(macOf('e5f6g7h8')).toBe('laptop');
  expect(macOf('zzzzzzzz')).toBeUndefined();
  expect(macOf(undefined)).toBeUndefined();
});
