import { expect, test } from 'vitest';
import { chatItems, newSince } from './chatItems';

const text = (value: string) => [{ code: false, text: value }];
const reply = (id: string, at: string | null, from: 'agent' | 'you' = 'agent') => ({
  id,
  at,
  segments: text(id),
  from,
});

test('the conversation runs oldest first, the person apart from the agent, grouped by speaker and time', () => {
  // As the Mac sends them: newest first.
  const items = chatItems(
    [
      reply('r3', '2026-11-12T11:00:00Z'),
      reply('r2', '2026-11-12T10:02:00Z'),
      reply('ask', '2026-11-12T10:01:00Z', 'you'),
      reply('r1', '2026-11-12T10:00:00Z'),
    ],
    [],
  );
  expect(items.map((i) => [i.from, i.segments[0]?.text, i.first])).toEqual([
    ['agent', 'r1', true],
    ['you', 'ask', true],
    ['agent', 'r2', true],
    // An hour after r2, under the same speaker: a new group, with its time.
    ['agent', 'r3', true],
  ]);
  expect(items[0]).toMatchObject({ reply: 'r1', key: 'agent:r1:2026-11-12T10:00:00Z' });
  expect(items[1]?.reply).toBeUndefined();
  expect(
    chatItems([reply('b', '2026-11-12T10:03:00Z'), reply('a', '2026-11-12T10:00:00Z')], []).map(
      (i) => i.first,
    ),
  ).toEqual([true, false]);
});

test("this screen's sends follow the conversation until the transcript holds them", () => {
  const echoes = [
    { key: 'e1', text: 'Run the tests', photo: false, sending: false },
    { key: 'e2', text: 'And the docs', photo: true, sending: true },
  ];
  const before = chatItems([reply('r1', '2026-11-12T10:00:00Z')], echoes);
  expect(before.map((i) => [i.key, i.segments[0]?.text, i.sending, i.first])).toEqual([
    ['agent:r1:2026-11-12T10:00:00Z', 'r1', undefined, true],
    ['echo:e1', 'Run the tests', false, true],
    ['echo:e2', 'Photo. And the docs', true, false],
  ]);
  const landed = chatItems(
    [{ ...reply('p', '2026-11-12T10:05:00Z', 'you'), segments: text('Run the tests') }],
    echoes,
  );
  expect(landed.map((i) => i.key)).toEqual(['you:p:2026-11-12T10:05:00Z', 'echo:e2']);
});

test('the new count is how many messages came after the last one seen', () => {
  expect(newSince(['a', 'b', 'c'], 'a')).toBe(2);
  expect(newSince(['older', 'a', 'b'], 'b')).toBe(0);
  expect(newSince(['a'], undefined)).toBe(0);
  expect(newSince(['a'], 'gone')).toBe(0);
});

test("the agent's steps sit in their gap as one run each, after the prompt that asked", () => {
  const step = (id: string, newer: number) => ({
    type: 'tool' as const,
    id,
    newer,
    kind: 'command',
    name: 'Bash',
    target: id,
    status: 'done',
  });
  const items = chatItems(
    [reply('ask2', null, 'you'), reply('r1', '2026-11-12T10:05:00Z'), reply('ask1', null, 'you')],
    [],
    // Newest first, as the Mac sends them: s3 is still running after ask2, s1 and s2 led to r1.
    [step('s3', 0), step('s2', 1), step('s1', 1)],
  );
  expect(
    items.map((i) => (i.steps ? i.steps.map((s) => s.id).join('+') : i.segments[0]?.text)),
  ).toEqual(['ask1', 's1+s2', 'r1', 'ask2', 's3']);
  // A run speaks for the agent: it opens the agent's group, and its reply joins it.
  expect(items.map((i) => [i.from, i.first])).toEqual([
    ['you', true],
    ['agent', true],
    ['agent', false],
    ['you', true],
    ['agent', true],
  ]);
});
