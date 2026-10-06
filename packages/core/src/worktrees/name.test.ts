import { expect, test } from 'vitest';
import { branchLabel, worktreeName } from './name.js';

test('a worktree is named main or by its folder, and shows its branch or detached', () => {
  expect(worktreeName({ main: true, path: '/code/lantern-cove' })).toBe('main');
  expect(worktreeName({ main: false, path: '/code/lantern-cove-tide' })).toBe('lantern-cove-tide');
  expect(branchLabel({ branch: 'tide' })).toBe('tide');
  expect(branchLabel({})).toBe('detached');
});
