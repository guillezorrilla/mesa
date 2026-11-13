import { expect, test } from 'vitest';
import { rowActions } from './rowActions';

const labels = (state: string, unread = false) =>
  rowActions({ state, unread }, { mark: () => {}, archive: () => {} }).map((a) => a.label);

test('an ended session archives from its row; a live one, idle too, only marks', () => {
  expect(labels('done', true)).toEqual(['Mark read', 'Archive']);
  expect(labels('failed')).toEqual(['Mark unread', 'Archive']);
  expect(labels('stopped')).toEqual(['Mark unread', 'Archive']);
  expect(labels('idle')).toEqual(['Mark unread']);
  expect(labels('working')).toEqual(['Mark unread']);
});

test('each action runs what it names', () => {
  const ran: string[] = [];
  const [mark, archive] = rowActions(
    { state: 'done', unread: true },
    { mark: (unread) => ran.push(`mark ${unread}`), archive: () => ran.push('archive') },
  );
  mark?.run();
  archive?.run();
  expect(ran).toEqual(['mark false', 'archive']);
});
