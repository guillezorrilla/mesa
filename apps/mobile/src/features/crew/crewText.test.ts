import type { PhoneTask } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import {
  inTurn,
  mergeText,
  reportColor,
  reportWord,
  taskColor,
  taskOrder,
  taskWords,
} from './crewText';

const task = (id: string, state: string, more: Partial<PhoneTask> = {}): PhoneTask => ({
  id,
  title: `Task ${id}`,
  state,
  deps: [],
  ...more,
});

test("a worker's report kind reads as a word in its outcome's colour", () => {
  expect(reportWord({ kind: 'done' })).toBe('Done');
  expect(reportWord({ kind: 'question' })).toBe('Asks');
  expect(reportWord({ kind: 'later' })).toBe('later');
  expect(reportColor({ kind: 'failed' })).toBe('text-state-failed');
  expect(reportColor({ kind: 'question' })).toBe('text-state-waiting');
  expect(reportColor({ kind: 'finished' })).toBe('text-muted-foreground');
});

test('the task graph lists ready ones first, plan order kept within a state', () => {
  const tasks = [
    task('a', 'succeeded'),
    task('b', 'pending'),
    task('c', 'ready'),
    task('d', 'ready'),
    task('e', 'later'),
  ];
  expect(taskOrder(tasks).map((each) => each.id)).toEqual(['c', 'd', 'b', 'a', 'e']);
});

test("a task's words name what it waits for, and its colour its turn", () => {
  const crew = {
    tasks: [
      task('a', 'succeeded'),
      task('b', 'running'),
      task('c', 'pending', { deps: ['a', 'b', 'gone'] }),
      task('d', 'blocked', { gate: 'g-1' }),
    ],
  };
  expect(taskWords(crew.tasks[2] as PhoneTask, crew)).toBe('Waits for Task b, an earlier task');
  expect(taskWords(crew.tasks[3] as PhoneTask, crew)).toBe('Waits for your decision');
  expect(taskWords(task('e', 'ready'), crew)).toBe('Ready to start');
  expect(taskWords(task('f', 'later'), crew)).toBe('later');
  expect(taskColor('blocked')).toBe('bg-state-waiting');
  expect(taskColor('ready')).toBe('bg-state-working');
  expect(taskColor('succeeded')).toBe('bg-state-done');
});

test("a merge's outcome says merged, or how many files conflict", () => {
  expect(mergeText({ merged: true, branch: 'tide', conflicts: [] })).toBe(
    'Merged tide into this session',
  );
  expect(mergeText({ merged: false, branch: 'tide', conflicts: ['a.ts', 'b.ts'] })).toBe(
    'Not merged: 2 files conflict, so the merge was aborted',
  );
});

test('a worker working or waiting on a person is in its turn; queued, idle or done is not', () => {
  expect(['working', 'waiting-question', 'queued', 'idle', 'done'].map(inTurn)).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
});
