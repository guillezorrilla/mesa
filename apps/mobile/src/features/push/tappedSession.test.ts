import type { NotificationResponse } from 'expo-notifications';
import { expect, test } from 'vitest';
import { tappedSession } from './tappedSession';

const tap = (trigger: unknown) =>
  ({ notification: { request: { trigger } } }) as unknown as NotificationResponse;

test("a tapped push opens the session its payload names, and nothing else's", () => {
  expect(tappedSession(tap({ type: 'push', payload: { session: 'k3m9q2xz', aps: {} } }))).toBe(
    'k3m9q2xz',
  );
  expect(tappedSession(tap({ type: 'push', payload: { aps: {} } }))).toBeUndefined();
  expect(tappedSession(tap({ type: 'push', payload: { session: '../x' } }))).toBeUndefined();
  expect(tappedSession(tap(null))).toBeUndefined();
  expect(tappedSession(tap({ type: 'date', payload: { session: 'k3m9q2xz' } }))).toBeUndefined();
});
