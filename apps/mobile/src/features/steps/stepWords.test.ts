import type { PhoneStep } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { runSentence, SHOWN_LINES, shownText, stepLabel } from './stepWords';

const tool = (kind: string, target = '', status = 'done', name = 'Bash'): PhoneStep => ({
  type: 'tool',
  id: `${kind}-${target}`,
  newer: 0,
  kind,
  name,
  target,
  status,
});
const edit = (path: string): PhoneStep => ({
  type: 'edit',
  id: path,
  newer: 0,
  path,
  added: 2,
  removed: 1,
  status: 'done',
});

test("a step's row reads as orca's: a verb by its kind and state, then its target", () => {
  expect(stepLabel(tool('command', 'pnpm test'))).toEqual({ verb: 'Ran', target: 'pnpm test' });
  expect(stepLabel(tool('read', 'src/tide.ts', 'running'))).toEqual({
    verb: 'Reading',
    target: 'src/tide.ts',
  });
  expect(stepLabel(tool('other', '', 'done', 'mcp__tickets__list'))).toEqual({
    verb: 'Used',
    target: 'mcp__tickets__list',
  });
  expect(stepLabel(tool('a-newer-kind', 'x'))).toEqual({ verb: 'Used', target: 'x' });
  expect(stepLabel(edit('src/tide.ts'))).toEqual({ verb: 'Edited', target: 'src/tide.ts' });
  expect(stepLabel({ type: 'thought', id: 't', newer: 0, line: 'Feet or metres?' })).toEqual({
    verb: 'Thought',
    target: 'Feet or metres?',
  });
});

test('a run reads as one sentence, its kinds counted in the order they came', () => {
  expect(
    runSentence([
      tool('command', 'a'),
      edit('src/tide.ts'),
      tool('command', 'b'),
      edit('src/tide.ts'),
      edit('src/moon.ts'),
      { type: 'thought', id: 't', newer: 0, line: 'x' },
    ]),
  ).toBe('Ran 2 commands, edited 2 files, thought');
  expect(runSentence([tool('read', 'a'), tool('plan')])).toBe('Read 1 file, updated the plan');
  expect(runSentence([tool('search', 'a'), tool('search', 'b')])).toBe('Searched 2 times');
});

test("a step's long text shows its first lines until Show all", () => {
  const long = Array.from({ length: SHOWN_LINES + 5 }, (_, n) => `line ${n}`).join('\n');
  expect(shownText(long, false)).toMatchObject({ more: 5 });
  expect(shownText(long, false).text.split('\n')).toHaveLength(SHOWN_LINES);
  expect(shownText(long, true)).toEqual({ text: long, more: 0 });
  expect(shownText('ok\n\n', false)).toEqual({ text: 'ok', more: 0 });
});
