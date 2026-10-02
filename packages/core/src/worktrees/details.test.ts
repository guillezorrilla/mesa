import { expect, test } from 'vitest';
import { countChanges } from './details.js';

test('git status counts staged, modified, and untracked; a rename carries its old path', () => {
  const status = [
    'M  staged.ts',
    ' M modified.ts',
    'MM both.ts',
    '?? new.txt',
    'R  to.ts',
    'from.ts',
    '',
  ];
  expect(countChanges(status.join('\0'))).toEqual({ staged: 3, modified: 2, untracked: 1 });
  expect(countChanges('')).toEqual({ staged: 0, modified: 0, untracked: 0 });
});
