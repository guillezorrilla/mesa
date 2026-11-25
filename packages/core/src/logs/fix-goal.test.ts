import { expect, test } from 'vitest';
import { errorFixGoal } from './fix-goal.js';

test("a fix's goal names the error, its counts and services, one occurrence and the query that reads more", () => {
  const goal = errorFixGoal({
    project: 'tide-tables-123',
    id: 'g1',
    message: 'TideTableNotFound',
    sample: 'TideTableNotFound\n  at tides.load',
    count: 41,
    firstSeen: '2026-05-06T06:30:00Z',
    lastSeen: '2026-05-06T07:09:00Z',
    services: ['tide-api'],
    badge: null,
    source: 'error-reporting',
  });
  expect(goal).toContain('It happened 41 times in tide-tables-123 (tide-api)');
  expect(goal).toContain('at tides.load');
  expect(goal.split('\n').at(-1)).toBe('The query: mesa logs errors samples tide-tables-123 g1');
});
