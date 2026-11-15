import { expect, test } from 'vitest';
import { promptTitle, typedAnswerHint } from './title.js';

test('a permission names its tool; a question says the agent asks', () => {
  expect(promptTitle({ kind: 'permission', tool: 'Bash' })).toBe('Allow Bash?');
  expect(promptTitle({ kind: 'permission' })).toBe('Allow this tool?');
  expect(promptTitle({ kind: 'question', tool: 'AskUserQuestion' })).toBe('The agent asks');
});

test("a typed answer is a question's answer, or a permission's reason to deny", () => {
  expect(typedAnswerHint({ kind: 'question' })).toBe('Or type an answer');
  expect(typedAnswerHint({ kind: 'permission' })).toBe('Or deny with a reason');
});
