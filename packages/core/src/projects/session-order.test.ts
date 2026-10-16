import { expect, test } from 'vitest';
import { moveSession, orderSessions, withSessionOrder } from './session-order.js';

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

test('saved sessions come first in their order, unsaved ones after as given', () => {
  const sessions = rows('aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004');
  const order = ['aaaa0003', 'gone0000', 'aaaa0001'];
  expect(orderSessions(sessions, order).map((s) => s.id)).toEqual([
    'aaaa0003',
    'aaaa0001',
    'aaaa0002',
    'aaaa0004',
  ]);
  expect(orderSessions(sessions, [])).toEqual(sessions);
});

test('a move lands at the index among the others, clamped to either end', () => {
  const ids = ['a', 'b', 'c'];
  expect(moveSession(ids, 'c', 0)).toEqual(['c', 'a', 'b']);
  expect(moveSession(ids, 'a', 2)).toEqual(['b', 'c', 'a']);
  expect(moveSession(ids, 'a', 1)).toEqual(['b', 'a', 'c']);
  expect(moveSession(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
  expect(moveSession(ids, 'b', 9)).toEqual(['a', 'c', 'b']);
});

test("a project's session order is set without touching the other projects", () => {
  const projects = [
    { name: 'one', sessionOrder: ['a'] },
    { name: 'two', sessionOrder: [] },
  ];
  const next = withSessionOrder(projects, 'two', ['b', 'c']);
  expect(next).toEqual([
    { name: 'one', sessionOrder: ['a'] },
    { name: 'two', sessionOrder: ['b', 'c'] },
  ]);
  expect(next[0]).toBe(projects[0]);
});
