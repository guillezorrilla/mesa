import { writeFileSync } from 'node:fs';
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

function setUp() {
  const run = withRealGit(scriptedRunner().run);
  const { mesa, dir } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  gitRepo(dir);
  return { status: () => mesa.git.status('lantern-cove'), dir };
}

test('a clean checkout has no operation and no conflicted change', async () => {
  const { status, dir } = setUp();
  writeFileSync(join(dir, 'tide.ts'), 'export const high = 6;\n');
  const read = await status();
  expect(read.operation).toBeNull();
  expect(read.changes).toEqual([{ path: 'tide.ts', index: '?', workingTree: '?' }]);
});

test('a merge stopped on a conflict names the merge and marks the unmerged file', async () => {
  const { status, dir } = setUp();
  writeFileSync(join(dir, 'harbour.md'), 'Moorings\n');
  testGit(dir, 'add', 'harbour.md');
  testGit(dir, 'commit', '-q', '-m', 'Add the harbour');
  mergeConflict(dir);
  const read = await status();
  expect(read.operation).toBe('merge');
  expect(read.changes).toEqual([
    { path: 'tide.ts', index: 'U', workingTree: 'U', conflicted: true },
  ]);
  testGit(dir, 'merge', '--abort');
  expect((await status()).operation).toBeNull();
});

test('a rebase and a cherry-pick stopped on a conflict are named', async () => {
  const { status, dir } = setUp();
  mergeConflict(dir);
  testGit(dir, 'merge', '--abort');
  testGit(dir, 'switch', '-q', 'swell');
  // Each stops on the conflict, exiting 1.
  expect(() => testGit(dir, 'rebase', '-q', 'main')).toThrow();
  expect((await status()).operation).toBe('rebase');
  expect((await status()).changes.filter((change) => change.conflicted)).toHaveLength(1);
  testGit(dir, 'rebase', '--abort');
  expect(() => testGit(dir, 'cherry-pick', 'main')).toThrow();
  expect((await status()).operation).toBe('cherry-pick');
});
