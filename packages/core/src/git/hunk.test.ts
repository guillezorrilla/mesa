import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { gitRepo, projectProfile, scriptedRunner, testGit, withRealGit } from '../testing/index.js';
import { patchHunks } from './hunk.js';
import { hunkRange } from './hunk-range.js';

const lines = (count: number, changed: Record<number, string> = {}) =>
  `${Array.from({ length: count }, (_, i) => changed[i + 1] ?? `line ${i + 1}`).join('\n')}\n`;

/** A tracked 20-line file changed at lines 2 and 18: two hunks, far enough apart. */
function setUp() {
  const run = withRealGit(scriptedRunner().run);
  const { mesa, dir } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  writeFileSync(join(dir, 'tide.md'), lines(20));
  gitRepo(dir);
  writeFileSync(join(dir, 'tide.md'), lines(20, { 2: 'high water', 18: 'low water' }));
  const diff = (staged = false) =>
    testGit(dir, 'diff', ...(staged ? ['--cached'] : []), '--', 'tide.md');
  return { mesa, dir, diff };
}

test('stages the second of two hunks alone, then unstages it back', async () => {
  const { mesa, diff } = setUp();
  const staged = await mesa.git.stage('lantern-cove', 'tide.md', undefined, { index: 1 });
  expect(staged.result).toMatchObject({ path: 'tide.md', action: 'stage', hunk: 1 });
  expect(diff(true)).toContain('+low water');
  expect(diff(true)).not.toContain('high water');
  expect(diff()).toContain('+high water');
  expect(diff()).not.toContain('low water');

  await mesa.git.unstage('lantern-cove', 'tide.md', undefined, { index: 0 });
  expect(diff(true)).toBe('');
  expect(diff()).toContain('+low water');
});

test('the range the caller saw must still be the hunk', async () => {
  const { mesa } = setUp();
  const read = await mesa.git.diff('lantern-cove', { path: 'tide.md' });
  const second = patchHunks(read.patch).hunks[1]?.[0];
  expect(second).toMatch(/^@@ -15,6 \+15,6 @@/);
  const done = await mesa.git.stage('lantern-cove', 'tide.md', undefined, {
    index: 1,
    expect: hunkRange([15, 16, 17, 18, 19, 20], [15, 16, 17, 18, 19, 20]),
  });
  expect(done.result.hunk).toBe(1);
});

test('a stale hunk is refused and the index is left as it was', async () => {
  const { mesa, dir, diff } = setUp();
  // The person saw two hunks; the file changed back at line 18 since.
  writeFileSync(join(dir, 'tide.md'), lines(20, { 2: 'high water' }));
  await expect(mesa.git.stage('lantern-cove', 'tide.md', undefined, { index: 1 })).rejects.toThrow(
    /no hunk 1 in its unstaged diff, which has 1/,
  );
  // A shift moves hunk 0 to another range than the one shown.
  writeFileSync(join(dir, 'tide.md'), `new first\n${lines(20, { 2: 'high water' })}`);
  await expect(
    mesa.git.stage('lantern-cove', 'tide.md', undefined, { index: 0, expect: '-1,5 +1,5' }),
  ).rejects.toThrow(/is now -1,5 \+1,6, not -1,5 \+1,5/);
  expect(diff(true)).toBe('');
});
