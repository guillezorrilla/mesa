import { expect, test } from 'vitest';
import { describePairing } from './describePairing';

const NOW = Date.parse('2026-09-24T12:30:00.000Z');

test('a paired phone says when it paired and when it was last seen', () => {
  expect(
    describePairing(
      {
        paired: true,
        since: '2026-09-24T12:00:00.000Z',
        phoneLastSeen: '2026-09-24T12:25:00.000Z',
      },
      false,
      NOW,
    ),
  ).toBe('Paired 30m ago, phone last seen 5m ago');
  expect(describePairing({ paired: true }, false, NOW)).toBe('Paired');
});

test('a code on show asks for the scan; otherwise it says what pairing gives', () => {
  expect(describePairing({ paired: false, pending: true }, true, NOW)).toBe(
    'Scan the code with the Mesa app on your phone',
  );
  expect(describePairing(undefined, false, NOW)).toMatch(/^Get pinged on your phone/);
});
