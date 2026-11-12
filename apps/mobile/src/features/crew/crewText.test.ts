import type { PhoneTask } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { mergeText, reportText, taskColor, taskOrder, taskWords } from './crewText';

const task = (id: string, state: string, more: Partial<PhoneTask> = {}): PhoneTask => ({
  id,
  title: `Task ${id}`,
  state,
  deps: [],
  ...more,
});

test("a worker's report reads as its kind and message", () => {
  expect(reportText({ kind: 'done', at: '', message: 'tests pass' })).toBe('Done: tests pass');
  expect(reportText({ kind: 'question', at: '', message: 'metres?' })).toBe('Asks: metres?');
  expect(reportText({ kind: 'later', at: '', message: 'x' })).toBe('later: x');
});

test('the task graph lists ready ones first, plan order kept within a state', () => {
  const tasks = [
    task('a', 'succeeded'),
    task('b', 'pending'),
    task('c', 'ready'),
    task('d', 'ready'),
  ];
  expect(taskOrder(tasks).map((each) => each.id)).toEqual(['c', 'd', 'b', 'a']);
});

test("a task's words name what it waits for", () => {
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
  expect(taskColor('blocked')).toBe('bg-state-waiting');
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
