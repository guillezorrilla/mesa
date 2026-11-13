import type { PhoneStep } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import {
  LIVE_TARGET,
  liveWords,
  runSentence,
  SHOWN_LINES,
  shownText,
  stepLabel,
} from './stepWords';

const tool = (kind: string, target = '', status = 'done', name = 'Bash'): PhoneStep => ({
  type: 'tool',
  id: `${kind}-${target}`,
  newer: 0,
  kind,
  name,
  target,
  status,
});
const edit = (path: string, status = 'done'): PhoneStep => ({
  type: 'edit',
  id: path,
  newer: 0,
  path,
  added: 2,
  removed: 1,
  status,
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

test("the live line names the agent's current step, Thinking after a thought, else Working", () => {
  const live = (step?: PhoneStep) => {
    const { verb, target } = liveWords(step);
    return target ? `${verb} ${target}` : verb;
  };
  expect(live(tool('command', 'pnpm test', 'running'))).toBe('Running pnpm test');
  expect(live(tool('read', 'src/merchant-settings.ts', 'running'))).toBe(
    'Reading src/merchant-settings.ts',
  );
  expect(live(edit('src/tide.ts', 'running'))).toBe('Editing src/tide.ts');
  expect(live(tool('search', 'floor\\(', 'running'))).toBe('Searching floor\\(');
  expect(live({ type: 'thought', id: 't', newer: 0, line: 'Feet or metres?' })).toBe('Thinking');
  expect(live(tool('a-newer-kind', '', 'running', 'mcp__tickets__list'))).toBe(
    'Using mcp__tickets__list',
  );
  expect(live()).toBe('Working');

  const long = liveWords(
    tool('command', `pnpm exec vitest run ${'src/a.test.ts '.repeat(9)}\necho`, 'running'),
  );
  expect(Array.from(long.target)).toHaveLength(LIVE_TARGET);
  expect(long.target).toMatch(/^pnpm exec vitest run src\/a\.test\.ts .*\.\.\.$/);
  expect(liveWords(tool('command', 'cd web &&\npnpm build', 'running')).target).toBe('cd web &&');
});
