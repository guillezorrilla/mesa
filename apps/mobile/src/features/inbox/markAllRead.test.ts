import { MacCallError, type PhoneCall, type PhoneNotice } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import type { MacLink } from '../mac/macLink';
import { markAllRead } from './markAllRead';

const notice = (id: string, read: boolean): PhoneNotice => ({
  id,
  kind: 'finished',
  at: '2026-11-12T10:00:00.000Z',
  title: 'Session turn finished',
  read,
});
const notices = async () => [notice('a', false), notice('b', true), notice('c', false)];

/** A Mac that answers `noticesRead` with `answer`, recording every call it gets. */
const mac = (answer: () => unknown) => {
  const calls: PhoneCall[] = [];
  const call = (async (one: PhoneCall) => {
    calls.push(one);
    return one.method === 'noticesRead' ? answer() : {};
  }) as MacLink['call'];
  return { call, calls };
};

test('a Mac with noticesRead marks every notice in one call', async () => {
  const { call, calls } = mac(() => ({ count: 2 }));
  await markAllRead(call, notices);
  expect(calls).toEqual([{ method: 'noticesRead' }]);
});

test('an older Mac that lets noticesRead time out has each unread notice marked', async () => {
  const { call, calls } = mac(() => {
    throw new MacCallError('timeout', 'the Mac did not answer in time');
  });
  await markAllRead(call, notices);
  expect(calls.slice(1)).toEqual([
    { method: 'noticeRead', id: 'a' },
    { method: 'noticeRead', id: 'c' },
  ]);
});

test("the Mac's own error is not retried one notice at a time", async () => {
  const { call, calls } = mac(() => {
    throw new MacCallError('failed', 'no inbox');
  });
  await expect(markAllRead(call, notices)).rejects.toThrow('no inbox');
  expect(calls).toHaveLength(1);
});
