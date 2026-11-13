import { expect, test } from 'vitest';
import { macFor, rememberMac } from './sessionMacs';

test("a screen talks to the Mac its route names, else its id's, else the Mac it was pushed from", () => {
  expect(macFor({ id: 'unseen00' })).toBeUndefined();
  rememberMac('studio', ['a1b2c3d4', 'gate-1']);
  rememberMac('laptop', ['e5f6g7h8']);
  expect(macFor({ id: 'a1b2c3d4' })).toBe('studio');
  expect(macFor({ id: 'e5f6g7h8' })).toBe('laptop');
  // A session a fork on the laptop just started: not listed yet, so the laptop's.
  expect(macFor({ id: 'forked00' })).toBe('laptop');
  expect(macFor({ id: 'forked00', mac: 'studio' })).toBe('studio');
  expect(macFor({ id: 'forked00' })).toBe('studio');
  expect(macFor(undefined)).toBeUndefined();
});
