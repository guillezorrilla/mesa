import { expect, test } from 'vitest';
import { macSeenText } from './macSeenText';

const INFO = { createdAt: '2026-11-11T12:00:00.000Z', expiresAt: '2026-11-11T12:10:00.000Z' };

test('a Mac card says when it last checked in, that it has not, or that the broker is away', () => {
  expect(macSeenText({ ...INFO, macSeenAt: '2026-11-11T12:41:00.000Z' }, 'en-US')).toBe(
    'Last checked in Nov 11, 2026, 12:41 PM.',
  );
  expect(macSeenText(INFO)).toBe('Not checked in since pairing.');
  expect(macSeenText('unreachable')).toBe("Mesa's broker can't be reached right now.");
  expect(macSeenText('gone')).toBe('This Mac ended the pairing. Unpair it here too.');
});
