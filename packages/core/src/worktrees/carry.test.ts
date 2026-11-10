import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import { gitRepo, scriptedRunner, tempDir, testRunner } from '../testing/index.js';
import { carryEntries } from './carry.js';

/** A repository whose `.env` and `node_modules` are ignored, and an empty worktree beside it. */
function checkout() {
  const root = tempDir();
  const repo = join(root, 'repo');
  const worktree = join(root, 'worktree');
  mkdirSync(join(repo, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(worktree);
  writeFileSync(join(repo, '.gitignore'), '.env\nnode_modules/\n');
  writeFileSync(join(repo, 'README.md'), 'invented\n');
  gitRepo(repo);
  writeFileSync(join(repo, '.env'), 'TIDE_TOKEN=invented\n');
  writeFileSync(join(repo, 'node_modules', 'pkg', 'index.js'), 'export {};\n');
  symlinkSync('pkg/index.js', join(repo, 'node_modules', 'entry'));
  return { repo, worktree };
}

/** The real git, and `run`'s answers for everything else (the clone). */
const realGitOnly =
  (run: Runner): Runner =>
  (file, args, ms, options) =>
    (file === 'git' ? testRunner : run)(file, args, ms, options);

for (const [copy, run] of [
  ['as a clone where it can', testRunner],
  ['by plain copy when cp fails', realGitOnly(scriptedRunner({}, { failing: ['/bin/cp'] }).run)],
] as const) {
  test(`a file and a folder are carried ${copy}`, async () => {
    const { repo, worktree } = checkout();
    expect(await carryEntries(run, repo, worktree, ['.env', 'node_modules'])).toBeUndefined();
    expect(readFileSync(join(worktree, '.env'), 'utf8')).toBe('TIDE_TOKEN=invented\n');
    expect(readFileSync(join(worktree, 'node_modules', 'pkg', 'index.js'), 'utf8')).toBe(
      'export {};\n',
    );
    expect(readlinkSync(join(worktree, 'node_modules', 'entry'))).toBe('pkg/index.js');
  });
}

test('the clone is /bin/cp -c -R -n', async () => {
  const { repo, worktree } = checkout();
  const { run, calls } = scriptedRunner();
  await carryEntries(realGitOnly(run), repo, worktree, ['.env']);
  expect(calls).toEqual([
    expect.objectContaining({
      file: '/bin/cp',
      args: ['-c', '-R', '-n', join(repo, '.env'), join(worktree, '.env')],
    }),
  ]);
});

test('a carry past its budget stops at that entry and says which and why', async () => {
  const { repo, worktree } = checkout();
  // .env is one entry; node_modules is four (itself, pkg, index.js, entry).
  const stopped = await carryEntries(testRunner, repo, worktree, ['.env', 'node_modules'], {
    bytes: 1024,
    entries: 4,
  });
  expect(stopped).toBe(
    'carry stopped at node_modules: the carry would pass 4 entries; it was not carried',
  );
  expect(existsSync(join(worktree, '.env'))).toBe(true);
  expect(existsSync(join(worktree, 'node_modules'))).toBe(false);
});

test('a carry past its bytes stops before anything is copied', async () => {
  const { repo, worktree } = checkout();
  expect(
    await carryEntries(testRunner, repo, worktree, ['.env', 'node_modules'], {
      bytes: 8,
      entries: 10,
    }),
  ).toBe('carry stopped at .env: the carry would pass 8 bytes; it and 1 after it were not carried');
  expect(existsSync(join(worktree, '.env'))).toBe(false);
});

test('a tracked or missing entry is refused', async () => {
  const { repo, worktree } = checkout();
  await expect(carryEntries(testRunner, repo, worktree, ['README.md'])).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(carryEntries(testRunner, repo, worktree, ['absent'])).rejects.toMatchObject({
    code: 'usage',
  });
});
