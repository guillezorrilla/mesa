import { expect, test } from 'vitest';
import { counted } from '../../lib/format.js';
import type { SessionRow } from '../board/rows.js';
import {
  attentionScore,
  contextPercent,
  sessionBranch,
  sessionCount,
  sessionLabel,
  sessionTitle,
  waitingOn,
} from './labels.js';

// Only the fields the view reads.
const row = (fields: object) => fields as SessionRow;
const managed = (fields: object) => row({ managed: true, id: 'a1b2c3d4', ...fields });
const foreign = row({ managed: false, id: 'ext-4200' });

test('a row reads as its name, else its agent name, else its id; its branch is its worktree, else the one it waits for', () => {
  expect(sessionLabel(managed({ name: 'tide notes' }))).toBe('tide notes');
  expect(sessionLabel(managed({}))).toBe('a1b2c3d4');
  // The name its agent gives it (a /rename in Claude Code), unless a person named it in Mesa.
  expect(sessionLabel(managed({ agentName: 'tide-charts' }))).toBe('tide-charts');
  expect(sessionLabel(managed({ name: 'tide notes', agentName: 'tide-charts' }))).toBe(
    'tide notes',
  );
  expect(sessionTitle(managed({ agentName: 'tide-charts', goal: 'Chart the tide' }))).toBe(
    'tide-charts',
  );
  expect(sessionTitle(managed({ goal: 'Chart the tide' }))).toBe('Chart the tide');
  expect(sessionLabel(row({ managed: false, id: 'ext-4200', name: 'theirs' }))).toBe('ext-4200');
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

test('an attention score and a context reading read the same everywhere', () => {
  expect(attentionScore(0.8333)).toBe('0.83');
  expect([21.16, 54.5, 120, -3].map(contextPercent)).toEqual([21, 55, 100, 0]);
});
