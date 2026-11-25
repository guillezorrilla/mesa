import { expect, test } from 'vitest';
import { keyed, levelCounts, logPrompt, shownEntries } from './logLines';

const entry = (
  message: string,
  level: 'error' | 'warn' | 'info' | null,
  stack: string | null = null,
) => ({
  time: null,
  level,
  message,
  stack,
});

test('a repeated line keeps its own key, by which repeat it is', () => {
  expect(keyed([entry('boom', 'error'), entry('boom', 'error')]).map((e) => e.key)).toEqual([
    'null|error|boom#0',
    'null|error|boom#1',
  ]);
});

test('levels and words filter, counts follow the levels', () => {
  const all = [
    entry('GET /tides 200', 'info'),
    entry('slow tide', 'warn'),
    entry('boom', 'error', '  at dock (src/dock.ts:4:2)'),
  ];
  expect(levelCounts(all)).toEqual({ all: 3, error: 1, warn: 1 });
  expect(shownEntries(all, 'warn', '').map((e) => e.message)).toEqual(['slow tide']);
  expect(shownEntries(all, 'all', 'DOCK.ts').map((e) => e.message)).toEqual(['boom']);
});

test('Send to agent names the source and keeps each stack under its line', () => {
  expect(
    logPrompt('harbour-api (Docker)', [
      { time: null, level: 'error', message: 'cannot moor', stack: '  at dock (src/dock.ts:4:2)' },
      entry('WARN tide rising', 'warn'),
    ]),
  ).toBe(
    'These lines from the harbour-api (Docker) log:\n```\nERROR cannot moor\n  at dock (src/dock.ts:4:2)\nWARN tide rising\n```\n',
  );
});
