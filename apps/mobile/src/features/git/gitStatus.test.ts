import { expect, test } from 'vitest';
import { canStage, canUnstage, statusWords } from './gitStatus';

const file = (index: string, workingTree: string) => ({ path: 'src/tide.ts', index, workingTree });

test('a file is staged, not staged, partly staged, or new', () => {
  expect(statusWords(file('M', ' '))).toBe('modified, staged');
  expect(statusWords(file(' ', 'M'))).toBe('modified, not staged');
  expect(statusWords(file('M', 'M'))).toBe('modified, partly staged');
  expect(statusWords(file('?', '?'))).toBe('new, not staged');
  expect(statusWords(file('A', ' '))).toBe('added, staged');
  expect([canStage(file('?', '?')), canUnstage(file('?', '?'))]).toEqual([true, false]);
  expect([canStage(file('M', ' ')), canUnstage(file('M', ' '))]).toEqual([false, true]);
});
