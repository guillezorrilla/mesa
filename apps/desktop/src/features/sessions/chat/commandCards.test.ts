import type { ChatItem } from '@mesa/core';
import { expect, test } from 'vitest';
import { commandCards } from './commandCards';

const command = (id: string, text: string, output?: string): ChatItem => ({
  id,
  at: null,
  text,
  from: 'command',
  ...(output === undefined ? {} : { output }),
});
const LIST = 'Usage: /config key=value [key=value ...]\n  lanternGlow=true|false';

test('a usage list is a form card that takes in the changes made after it', () => {
  const card = command('a', '/config', LIST);
  const set = command('b', '/config lanternGlow=true', 'Lantern glow set to true');
  const other = command('c', '/compact', '');
  const { cards, folded } = commandCards([card, set, other]);
  expect(cards.get(card)).toEqual({
    card: {
      kind: 'form',
      form: { command: '/config', fields: [{ key: 'lanternGlow', kind: 'boolean' }] },
    },
    replies: [set],
  });
  expect([...folded]).toEqual([set]);
  expect(cards.has(other)).toBe(false);
});

test('a change goes to the newest card for its command; one before any card stays a row', () => {
  const early = command('a', '/config lanternGlow=false', 'Lantern glow set to false');
  const first = command('b', '/config', LIST);
  const second = command('c', '/config', LIST);
  const set = command('d', '/config lanternGlow=true', 'Lantern glow set to true');
  const { cards, folded } = commandCards([early, first, second, set]);
  expect(cards.get(first)?.replies).toEqual([]);
  expect(cards.get(second)?.replies).toEqual([set]);
  expect(folded.has(early)).toBe(false);
});

test("/model is a row, alone or with a name: the footer's menu picks a model (#1222)", () => {
  const pick = command('a', '/model', 'Current model: `Haiku 5.5`');
  const direct = command('b', '/model sonnet', 'Set model to Sonnet 5.5');
  const { cards } = commandCards([pick, direct]);
  expect(cards.has(pick)).toBe(false);
  expect(cards.has(direct)).toBe(false);
});
