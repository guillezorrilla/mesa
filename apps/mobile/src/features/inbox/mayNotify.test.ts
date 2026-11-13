import type { PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { mayNotify } from './mayNotify';

const row = (state: string): PhoneRow => ({
  id: 'a',
  title: 'Session a',
  project: 'tide-pool',
  state,
  since: '2026-11-12T00:00:00.000Z',
  context: null,
  unread: false,
});
const update = (...states: string[]) => ({
  kind: 'update' as const,
  rows: states.map(row),
  gone: [],
  order: [],
});

test('an update may bring a notice when a session waits or stops working, not while all work', () => {
  expect(mayNotify(update('waiting-permission'))).toBe(true);
  expect(mayNotify(update('working', 'idle'))).toBe(true);
  expect(mayNotify(update('working', 'queued'))).toBe(false);
  expect(mayNotify(update())).toBe(false);
});
