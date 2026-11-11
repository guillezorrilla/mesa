import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  gitRepo,
  mergeConflict,
  projectProfile,
  scriptedRunner,
  testGit,
  withRealGit,
} from '../testing/index.js';
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

test('a checkout stopped in a merge says so in the list; a clean one says nothing', async () => {
  const { mesa, dir, home } = projectProfile(withRealGit(scriptedRunner().run), {
    mesaYaml: 'name: lantern-cove\n',
  });
  gitRepo(dir);
  const linked = join(home, 'skiff');
  testGit(dir, 'worktree', 'add', '-q', '-b', 'skiff', linked);
  mergeConflict(dir);
  const rows = await mesa.worktrees.list('lantern-cove');
  expect(rows.find((row) => row.main)?.operation).toBe('merge');
  const clean = rows.find((row) => !row.main);
  expect(clean?.path).toBeDefined();
  expect(clean).not.toHaveProperty('operation');
});
