import { expect, test } from 'vitest';
import {
  attentionScore,
  contextPercent,
  counted,
  duration,
  listPrice,
  percent,
  sessionBranch,
  sessionCount,
  sessionLabel,
  waitingOn,
} from './display.js';
import type { SessionRow } from './sessions/board/rows.js';

// Only the fields the view reads.
const row = (fields: object) => fields as SessionRow;
const managed = (fields: object) => row({ managed: true, id: 'a1b2c3d4', ...fields });
const foreign = row({ managed: false, id: 'ext-4200' });

test('a row reads as its name, else its id; its branch is its worktree, else the one it waits for', () => {
  expect(sessionLabel(managed({ name: 'tide notes' }))).toBe('tide notes');
  expect(sessionLabel(managed({}))).toBe('a1b2c3d4');
  expect(sessionLabel(foreign)).toBe('ext-4200');
  const worktree = { path: '/w/try-x', branch: 'try/x' };
  expect(sessionBranch(managed({ worktree, pending: { branch: 'later' } }))).toBe('try/x');
  expect(sessionBranch(managed({ pending: { branch: 'later' } }))).toBe('later');
  expect(sessionBranch(managed({}))).toBeUndefined();
  expect(sessionBranch(foreign)).toBeUndefined();
  expect(waitingOn('a1b2c3d4')).toBe('waiting on a1b2c3d4');
  expect([1, 2].map(sessionCount)).toEqual(['1 session', '2 sessions']);
  expect([1, 30].map((n) => counted(n, 'day'))).toEqual(['1 day', '30 days']);
});

test('durations and list prices read the same everywhere', () => {
  expect([0, 42, 60, 303, 3600, 7620].map(duration)).toEqual([
    '0s',
    '42s',
    '1m00s',
    '5m03s',
    '1h00m',
    '2h07m',
  ]);
  expect(listPrice(0.01234)).toBe(' (list price $0.0123)');
  expect(listPrice(undefined)).toBe('');
});

test('a confidence, an attention score, and a context reading read the same everywhere', () => {
  expect(percent(0.954)).toBe('95%');
  expect(attentionScore(0.8333)).toBe('0.83');
  expect([21.16, 54.5, 120, -3].map(contextPercent)).toEqual([21, 55, 100, 0]);
});
