import { expect, test } from 'vitest';
import { panelLines } from './panel.js';

// Screens shaped as Claude Code 2.1 and Codex 0.16 draw them, with invented content.
const RULE = '─'.repeat(40);
const FOOTER = [RULE, '❯ ', RULE, '  kettle · main', '  ⏵⏵ auto mode on (shift+tab to cycle)'];

test("Claude Code's panel in the input box's place is shown from under its top edge, colours kept", () => {
  const screen = [
    '❯ earlier prompt',
    '⏺ An earlier reply.',
    `${'▔'.repeat(30)} ● high · /effort ▔`,
    '   Select model',
    '\x1b[36m   ❯ 2.  Heron ✔\x1b[0m',
    '     3.  Wren',
    '   Enter to set as default · Esc to cancel',
  ];
  expect(panelLines(screen, '/model')).toEqual(screen.slice(3));
});

test('a command that prints shows the lines under its echo, up to the prompt', () => {
  const screen = ['\x1b[2m❯ /context\x1b[0m', '  Context 4% used', '  Messages: 2.8k', ...FOOTER];
  expect(panelLines(screen, '/context')).toEqual(['  Context 4% used', '  Messages: 2.8k']);
});

test("Codex's bare echo is found, and its output runs to the composer", () => {
  const screen = [
    '/status',
    '  Model:  heron-1 (reasoning high)',
    '  Weekly limit: 96% left',
    '› Ask Codex to do anything',
    '  heron-1 high · ~/code/kettle',
  ];
  expect(panelLines(screen, '/status')).toEqual(screen.slice(1, 3));
});

test('the newest of an echo and a panel wins; nothing on screen shows nothing', () => {
  const closed = ['❯ /model', '  ⎿  Set model to Wren', ...FOOTER];
  const reopened = [...closed.slice(0, 2), '▔▔▔▔▔▔', '   Select model'];
  expect(panelLines(closed, '/model')).toEqual(['  ⎿  Set model to Wren']);
  expect(panelLines(reopened, '/model')).toEqual(['   Select model']);
  expect(panelLines(['⏺ A reply.', ...FOOTER], '/cost')).toEqual([]);
});
