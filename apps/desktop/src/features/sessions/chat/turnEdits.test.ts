import type { ChatItem, ChatRun } from '@mesa/core';
import { expect, test } from 'vitest';
import { turnEdits } from './turnEdits';

const at = '2026-09-28T12:00:00.000Z';
const said = (from: 'you' | 'agent' | 'command', text: string): ChatItem => ({
  id: text,
  at,
  text,
  from,
});
const run = (id: string, edits?: ChatRun['edits']): ChatRun => ({
  id,
  at,
  text: 'Edited 1 file',
  from: 'steps',
  steps: [],
  ...(edits ? { edits } : {}),
});

test("a turn's files close it, summed across its runs; a turn that edited none has none", () => {
  const done = said('agent', 'done');
  const messages = [
    said('you', 'fix the tide'),
    run('r1', [{ path: 'src/tide.ts', added: 3, removed: 1 }]),
    said('agent', 'half way'),
    run('r2', [
      { path: 'src/tide.ts', added: 2, removed: 0 },
      { path: 'src/moon.ts', added: 1, removed: 1 },
    ]),
    done,
    said('you', 'thanks'),
    run('r3'),
    said('agent', 'welcome'),
  ];
  expect([...turnEdits(messages)]).toEqual([
    [
      done,
      [
        { path: 'src/tide.ts', added: 5, removed: 1 },
        { path: 'src/moon.ts', added: 1, removed: 1 },
      ],
    ],
  ]);
});

test('a slash command starts a turn too, and the running turn closes at the last item', () => {
  const first = run('r1', [{ path: 'a.ts', added: 1, removed: 0 }]);
  const last = run('r2', [{ path: 'b.ts', added: 2, removed: 0 }]);
  const turns = turnEdits([said('you', 'go'), first, said('command', '/review'), last]);
  expect(turns.get(first)).toEqual([{ path: 'a.ts', added: 1, removed: 0 }]);
  expect(turns.get(last)).toEqual([{ path: 'b.ts', added: 2, removed: 0 }]);
});
