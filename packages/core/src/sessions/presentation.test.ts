import { expect, test } from 'vitest';
import type { TreeRow } from './board/tree.js';
import { DEFAULT_BOARD_PREFERENCES, moveBoardSession, presentSessions } from './presentation.js';

const rows = [
  {
    id: 'aaaaaaaa',
    project: 'lantern',
    agent: 'claude',
    managed: true,
    startedAt: '2026-01-01T00:00:00Z',
    attention: 0.9,
    depth: 0,
    workflowStatus: 'review',
  },
  {
    id: 'bbbbbbbb',
    project: 'tide',
    agent: 'codex',
    managed: true,
    startedAt: '2026-01-03T00:00:00Z',
    attention: 0.5,
    depth: 1,
    parent: 'aaaaaaaa',
  },
  {
    id: 'cccccccc',
    project: 'lantern',
    agent: 'claude',
    managed: true,
    startedAt: '2026-01-02T00:00:00Z',
    attention: 0.1,
    depth: 0,
    workflowStatus: 'todo',
  },
] as TreeRow[];

test('presentation keeps the default tree, but groups and sorts alternate views independently of workflow state', () => {
  expect(
    presentSessions(rows, DEFAULT_BOARD_PREFERENCES)[0]?.rows.map((row) => [row.id, row.depth]),
  ).toEqual([
    ['aaaaaaaa', 0],
    ['bbbbbbbb', 1],
    ['cccccccc', 0],
  ]);
  const recent = presentSessions(rows, {
    ...DEFAULT_BOARD_PREFERENCES,
    view: 'cards',
    group: 'project',
    sort: 'recent',
  });
  expect(recent.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
    ['tide', ['bbbbbbbb']],
    ['lantern', ['cccccccc', 'aaaaaaaa']],
  ]);
  expect(recent[0]?.rows[0]?.depth).toBe(0);
  const workflow = presentSessions(rows, {
    ...DEFAULT_BOARD_PREFERENCES,
    view: 'workflow',
    sort: 'manual',
    order: ['cccccccc', 'aaaaaaaa', 'bbbbbbbb'],
  });
  expect(workflow.find((group) => group.key === 'review')?.rows[0]?.id).toBe('aaaaaaaa');
  expect(workflow.find((group) => group.key === 'unassigned')?.rows[0]?.id).toBe('bbbbbbbb');
});

test('manual move stays within the managed rows of its current group', () => {
  const prefs = { ...DEFAULT_BOARD_PREFERENCES, group: 'project' as const };
  expect(moveBoardSession(rows, prefs, 'cccccccc', -1)).toEqual([
    'cccccccc',
    'aaaaaaaa',
    'bbbbbbbb',
  ]);
  expect(moveBoardSession(rows, prefs, 'bbbbbbbb', -1)).toEqual([
    'aaaaaaaa',
    'cccccccc',
    'bbbbbbbb',
  ]);
  expect(moveBoardSession(rows, { ...prefs, order: ['dddddddd'] }, 'cccccccc', -1)).toEqual([
    'cccccccc',
    'aaaaaaaa',
    'bbbbbbbb',
    'dddddddd',
  ]);
});
