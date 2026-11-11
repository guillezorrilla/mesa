import type { CrewRow, Task } from '@mesa/core';
import { expect, test } from 'vitest';
import { managedRow } from '@/lib/testing';
import { crewCards, crewSummary, phaseWords } from './crewPlan';

const NOW = Date.parse('2026-09-25T12:10:00.000Z');
const row = (id: string, state: string) =>
  ({
    ...managedRow(id, {
      lastState: { state, confidence: 1, at: '2026-09-25T12:09:00.000Z', source: 'hook' },
    } as never),
    branch: null,
  }) as CrewRow;
const task = (id: string, extra: Partial<Task>): Task => ({
  id,
  spec: `${id} title\nbody`,
  graph: 'harbor',
  deps: [],
  state: 'pending',
  createdAt: '2026-09-25T12:00:00.000Z',
  ...extra,
});

test('a waiting worker says where it waits: Your choice when it asked its parent, else its terminal', () => {
  const rows = [
    row('perm0001', 'waiting-permission'),
    row('quest001', 'waiting-question'),
    row('asks0001', 'idle'),
  ];
  const cards = crewCards([], rows, new Set(), new Set(['asks0001']));
  expect(cards.map((card) => phaseWords(card, NOW))).toEqual([
    'Waits for your permission in its terminal',
    'Waits for your answer in its terminal',
    'Asks you above',
  ]);
  expect(crewSummary(cards)).toBe('3 needs you');
});

test('a pending task waits for its unfinished deps by title; a failed one says why', () => {
  const cards = crewCards(
    [
      task('t-first00', { state: 'succeeded' }),
      task('t-second0', { state: 'running', worker: 'gone0000' }),
      task('t-third00', { deps: ['t-first00', 't-second0'] }),
      task('t-fourth0', { state: 'failed', reason: 'The feed is down' }),
      // Blocked, but its gate was resolved elsewhere: nothing waits above.
      task('t-fifth00', { state: 'blocked' }),
    ],
    [],
    new Set(),
    new Set(),
  );
  expect(cards.map((card) => phaseWords(card, NOW))).toEqual([
    'Done',
    'Starting',
    'Waits for t-second0 title',
    'Failed: The feed is down',
    'Waits for a decision',
  ]);
  expect(crewSummary(cards)).toBe('1 working, 2 waiting, 1 done, 1 failed');
});
