import { expect, test } from 'vitest';
import { unreadCount } from './unreadCount';

const notice = (id: string, read: boolean) => ({
  id,
  kind: 'finished',
  at: '2026-11-12T09:00:00.000Z',
  title: id,
  read,
});

test('the Inbox counts only unread notices', () => {
  expect(unreadCount([notice('a', false), notice('b', true), notice('c', false)])).toBe(2);
  expect(unreadCount([])).toBe(0);
});
