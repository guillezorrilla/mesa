import { expect, test } from 'vitest';
import { newestFirst } from './newestFirst';

const notice = (id: string, at: string) => ({ id, kind: 'finished', at, title: id, read: false });

test('the Inbox lists notices newest first, a time without milliseconds among them', () => {
  const sent = [
    notice('old', '2026-11-12T09:00:00.000Z'),
    notice('newest', '2026-11-12T10:00:01Z'),
    notice('newer', '2026-11-12T10:00:00.900Z'),
  ];
  expect(newestFirst(sent).map((n) => n.id)).toEqual(['newest', 'newer', 'old']);
  expect(sent[0]?.id).toBe('old');
});
