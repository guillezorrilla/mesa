import { expect, test } from 'vitest';
import { promptTitle } from './promptTitle';

test('a permission names its tool; a question says the agent asks', () => {
  expect(promptTitle({ kind: 'permission', tool: 'Bash' })).toBe('Allow Bash?');
  expect(promptTitle({ kind: 'permission' })).toBe('Allow this tool?');
  expect(promptTitle({ kind: 'question', tool: 'AskUserQuestion' })).toBe('The agent asks');
});
