import { expect, test } from 'vitest';
import { runSentence } from './step-words.js';

const tool = (kind: string) => ({ type: 'tool' as const, kind });

test('a run reads as one sentence, kinds in first-seen order', () => {
  expect(
    runSentence([tool('read'), tool('command'), tool('read'), tool('read'), tool('command')]),
  ).toBe('Read 3 files, ran 2 commands');
});

test('edits count files, thoughts and plans read alone', () => {
  expect(
    runSentence([
      { type: 'edit', path: 'a.ts' },
      { type: 'edit', path: 'a.ts' },
      { type: 'thought' },
      tool('plan'),
      tool('mystery'),
    ]),
  ).toBe('Edited 1 file, thought, updated the plan, used 1 tool');
});
