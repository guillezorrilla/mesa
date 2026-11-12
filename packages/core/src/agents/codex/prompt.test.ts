import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { codexPrompt } from './prompt.js';

// Panes captured live (docs/spikes/codex.md, docs/spikes/prompt-answers.md), paths invented.
const pane = (name: string) =>
  readFileSync(new URL(`./fixtures/panes/${name}.txt`, import.meta.url), 'utf8');
const options = [
  { id: 'allow', label: 'Allow', keys: ['y'] },
  { id: 'deny', label: 'Deny', keys: ['Escape'] },
];

test('a command or edit approval offers Allow (y) and Deny (Esc), about what the dialog names', () => {
  expect(codexPrompt(pane('waiting-approval'))).toEqual({
    kind: 'permission',
    tool: 'Bash',
    summary: 'touch lantern.txt',
    options,
  });
  expect(codexPrompt(pane('edit-approval'))).toEqual({
    kind: 'permission',
    tool: 'apply_patch',
    summary: '/src/lantern-cove/README.md',
    options,
  });
});

test('its PermissionRequest hook names the tool and input when one was logged', () => {
  const event = {
    at: '2026-09-24T12:00:00.000Z',
    event: 'PermissionRequest',
    payload: { tool_name: 'Bash', tool_input: { command: 'touch lantern.txt -c' } },
  };
  expect(codexPrompt(pane('waiting-approval'), event)?.summary).toBe('touch lantern.txt -c');
  const older = { ...event, event: 'UserPromptSubmit' };
  expect(codexPrompt(pane('waiting-approval'), older)?.summary).toBe('touch lantern.txt');
});

test('any other screen reads as no prompt', () => {
  for (const name of ['idle', 'working', 'after-approve', 'after-deny', 'folder-trust']) {
    expect(codexPrompt(pane(name)), name).toBeUndefined();
  }
});
