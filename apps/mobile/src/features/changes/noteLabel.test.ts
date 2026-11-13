import { expect, test } from 'vitest';
import { noteLabel } from './noteLabel';

test('a note is on a line, a run of lines, or the whole file', () => {
  expect(noteLabel('src/tide.ts', { line: 4, end: 4 })).toBe('src/tide.ts, line 4');
  expect(noteLabel('src/tide.ts', { line: 4, end: 9 })).toBe('src/tide.ts, lines 4 to 9');
  expect(noteLabel('src/tide.ts', { line: 0, end: 0 })).toBe('src/tide.ts, the whole file');
});
