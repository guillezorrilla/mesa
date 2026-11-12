import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { claudePrompt } from './prompt.js';

// Panes captured live (docs/spikes/prompt-answers.md), their paths invented.
const pane = (name: string) =>
  readFileSync(new URL(`./fixtures/prompts/${name}.txt`, import.meta.url), 'utf8');
const asked = (tool: string, input: unknown, event = 'PermissionRequest') => ({
  at: '2026-09-24T12:00:00.000Z',
  event,
  payload: { hook_event_name: event, tool_name: tool, tool_input: input },
});
const colour = (more: object = {}) => ({
  questions: [
    {
      question: 'Do you prefer red or blue?',
      header: 'Color',
      options: [
        { label: 'Red', description: 'Choose red' },
        { label: 'Blue', description: 'Choose blue' },
      ],
      multiSelect: false,
      ...more,
    },
  ],
});

test('a permission dialog offers Allow (1) and Deny (Esc), about the command or file it names', () => {
  const bash = claudePrompt(pane('bash'), asked('Bash', { command: 'touch beacon.txt' }));
  expect(bash).toEqual({
    kind: 'permission',
    tool: 'Bash',
    summary: 'touch beacon.txt',
    options: [
      { id: 'allow', label: 'Allow', keys: ['1'] },
      { id: 'deny', label: 'Deny', keys: ['Escape'] },
    ],
  });
  const write = claudePrompt(pane('write'), asked('Write', { file_path: '~/src/notes.txt' }));
  expect(write).toMatchObject({ tool: 'Write', summary: '~/src/notes.txt' });
});

test('one single-choice question offers its answers by digit, and a typed answer after them', () => {
  const prompt = claudePrompt(pane('question'), asked('AskUserQuestion', colour()));
  expect(prompt).toEqual({
    kind: 'question',
    tool: 'AskUserQuestion',
    summary: 'Do you prefer red or blue?',
    options: [
      { id: '1', label: 'Red', description: 'Choose red', keys: ['1'] },
      { id: '2', label: 'Blue', description: 'Choose blue', keys: ['2'] },
    ],
    freeText: ['3'],
  });
  // PreToolUse fires first with the same input.
  const early = asked('AskUserQuestion', colour(), 'PreToolUse');
  expect(claudePrompt(pane('question'), early)).toEqual(prompt);
});

test('what it does not qualify reads as no prompt', () => {
  const bash = asked('Bash', { command: 'touch beacon.txt' });
  // Folder trust has no hook; a dialog with no hook event is never guessed at.
  expect(claudePrompt(pane('folder-trust'))).toBeUndefined();
  expect(claudePrompt(pane('folder-trust'), bash)).toBeUndefined();
  expect(claudePrompt(pane('bash'))).toBeUndefined();
  // Gone from the screen: the footer is no longer its last line.
  const answered = `${pane('bash')}\n\n⏺ Ran touch beacon.txt\n❯ `;
  expect(claudePrompt(answered, bash)).toBeUndefined();
  // A multi-choice question, several questions, or another question than the screen's.
  const question = pane('question');
  expect(claudePrompt(question, asked('AskUserQuestion', colour({ multiSelect: true })))).toBe(
    undefined,
  );
  const two = { questions: [...colour().questions, ...colour().questions] };
  expect(claudePrompt(question, asked('AskUserQuestion', two))).toBeUndefined();
  const other = colour({ options: [{ label: 'Green' }, { label: 'Gold' }] });
  expect(claudePrompt(question, asked('AskUserQuestion', other))).toBeUndefined();
  // A permission event over a question's screen.
  expect(claudePrompt(question, bash)).toBeUndefined();
});
