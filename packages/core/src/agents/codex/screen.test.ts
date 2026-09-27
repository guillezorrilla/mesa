import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { codexLastOutputLine, codexScreenState } from './screen.js';

// The spike's pane captures (docs/spikes/codex.md), trimmed, their paths invented.
const pane = (name: string) =>
  readFileSync(new URL(`./fixtures/panes/${name}.txt`, import.meta.url), 'utf8');

test('each captured screen reads as the state it shows', () => {
  const states = Object.fromEntries(
    [
      'folder-trust',
      'hooks-review',
      'hooks-list',
      'resume-folder',
      'waiting-approval',
      'working',
      'idle',
      'after-approve',
      'after-deny',
      'typed',
      'after-exit',
    ].map((name) => [name, codexScreenState(pane(name))]),
  );
  expect(states).toEqual({
    // The startup gates only a person gets past.
    'folder-trust': 'waiting-question',
    'hooks-review': 'waiting-question',
    'hooks-list': 'waiting-question',
    'resume-folder': 'waiting-question',
    'waiting-approval': 'waiting-permission',
    // The idle placeholder is still on screen under the working marker.
    working: 'working',
    idle: 'idle',
    'after-approve': 'idle',
    'after-deny': 'idle',
    // Text in the composer, or no composer at all, says nothing.
    typed: undefined,
    'after-exit': undefined,
  });
  expect(codexScreenState('')).toBeUndefined();
});

test("the board's last output is the last transcript line above the composer", () => {
  expect(codexLastOutputLine(pane('after-approve'))).toBe('• Ran touch lantern.txt successfully.');
  // A dialog's choice is the composer too; the status line is not output.
  expect(codexLastOutputLine(pane('waiting-approval'))).toBe('• Running touch lantern.txt');
  expect(codexLastOutputLine(pane('working'))).toBeUndefined();
  expect(codexLastOutputLine(pane('after-exit'))).toBe('• Ran touch lantern3.txt successfully.');
  expect(codexLastOutputLine(`• ${'x'.repeat(300)}\n\n› Ask Codex to do anything`)).toHaveLength(
    200,
  );
});
