import { expect, test } from 'vitest';
import { runColor, runWords } from './runText';

test("a run's outcome reads in words and in its state colour", () => {
  expect(runWords('pending')).toBe('Waiting for you');
  expect(runWords('failed')).toBe('Failed');
  expect(runWords('paused')).toBe('paused');
  expect(runColor('pending')).toBe('bg-state-waiting');
  expect(runColor('running')).toBe('bg-state-working');
  expect(runColor('done')).toBe('bg-state-done');
  expect(runColor('failed')).toBe('bg-state-failed');
  expect(runColor('cancelled')).toBe('bg-muted-foreground');
});
