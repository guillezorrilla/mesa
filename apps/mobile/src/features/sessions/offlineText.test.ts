import { expect, test } from 'vitest';
import { offlineText } from './offlineText';

test('the offline line says when the Mac was last heard, or that it was not', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z');
  expect(offlineText(now - 5 * 60_000, now)).toBe(
    'Your Mac is not answering; it may be asleep or offline. Last heard from it 5m ago.',
  );
  expect(offlineText(undefined, now)).toMatch(/Nothing heard from it since the app opened\.$/);
  expect(offlineText(undefined, now, 'Studio')).toMatch(/^Studio is not answering;/);
});
