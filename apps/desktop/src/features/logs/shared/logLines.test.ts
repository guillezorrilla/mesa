import { expect, test } from 'vitest';
import { keyed, levelCounts, shownEntries } from './logLines';

const entry = (
  message: string,
  level: 'error' | 'warn' | 'info' | null,
  stack: string | null = null,
) => ({ time: null, level, message, logger: null, stack });

test('a repeated line keeps its own key, and a read keeps the objects it already had', () => {
  const first = keyed([entry('boom', 'error'), entry('boom', 'error')]);
  expect(first.map((e) => e.key)).toEqual(['null|error|boom#0', 'null|error|boom#1']);
  const again = keyed(
    [entry('boom', 'error'), entry('boom', 'error'), entry('calm', 'info')],
    first,
  );
  expect(again[0]).toBe(first[0]);
  expect(again[1]).toBe(first[1]);
});

test('levels, words and a request filter; counts follow the levels', () => {
  const all = [
    entry('GET /tides 200 reqId=7f3a', 'info'),
    entry('slow tide', 'warn'),
    entry('boom reqId=7f3a', 'error', '  at dock (src/dock.ts:4:2)'),
  ];
  expect(levelCounts(all)).toEqual({ all: 3, error: 1, warn: 1 });
  expect(shownEntries(all, { level: 'warn', text: '' }).map((e) => e.message)).toEqual([
    'slow tide',
  ]);
  expect(shownEntries(all, { level: 'all', text: 'DOCK.ts' }).map((e) => e.message)).toEqual([
    'boom reqId=7f3a',
  ]);
  expect(
    shownEntries(all, { level: 'all', text: '', request: '7f3a' }).map((e) => e.message),
  ).toEqual(['GET /tides 200 reqId=7f3a', 'boom reqId=7f3a']);
});
