import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../../context.js';
import type { Runner } from '../../lib/process.js';
import {
  gitRepo,
  lockDeps,
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
  testGit,
  withRealGit,
} from '../../testing/index.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { shortstat, withLineCounts } from './line-counts.js';
import type { SessionRow } from './rows.js';

/** lantern-cove as a repository on main, git calls counted, and a board row in its main checkout. */
function setUp() {
  const diffs: string[][] = [];
  const real = withRealGit(scriptedRunner().run);
  const run: Runner = (file, args, ms, options) => {
    if (file === 'git' && args.includes('diff')) diffs.push(args);
    return real(file, args, ms, options);
  };
  const { home, dir } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  writeFileSync(join(dir, 'README.md'), '# Lantern Cove\n');
  gitRepo(dir);
  const ctx = createContext('default', testDeps(home, { run }));
  const deps = { ...lockDeps(), run, profile: ctx.open, file: join(home, 'line-counts.json') };
  const row = (fields: object = {}) =>
    ({ ...newSession(), id: 'aaaaaaaa', managed: true, ...fields }) as unknown as SessionRow;
  return { deps, dir, diffs, row };
}
const linesOf = async (deps: ReturnType<typeof setUp>['deps'], row: SessionRow) =>
  ((await withLineCounts(deps, [row]))[0] as { lines?: unknown }).lines;

test('git diff --shortstat reads as lines added and removed', () => {
  expect(shortstat(' 2 files changed, 12 insertions(+), 3 deletions(-)\n')).toEqual({
    added: 12,
    removed: 3,
  });
  expect(shortstat(' 1 file changed, 1 insertion(+)\n')).toEqual({ added: 1, removed: 0 });
  expect(shortstat('')).toEqual({ added: 0, removed: 0 });
});

test('a worktree is counted since its base, committed and not, and a look with nothing changed runs no diff', async () => {
  const { deps, dir, diffs, row } = setUp();
  const path = join(dir, '../tides');
  testGit(dir, 'worktree', 'add', '-q', '-b', 'tides', path);
  const worktree = { path, branch: 'tides', base: 'main' };
  appendFileSync(join(path, 'README.md'), 'High water at six.\n');
  const working = row({ worktree });
  expect(await linesOf(deps, working)).toEqual({ added: 1, removed: 0 });
  expect(diffs).toHaveLength(1);
  expect(await linesOf(deps, working)).toEqual({ added: 1, removed: 0 });
  expect(diffs).toHaveLength(1);

  // A commit moves HEAD: counted again, from the same base, the commit included.
  testGit(path, 'commit', '-qam', 'Add high water');
  writeFileSync(join(path, 'README.md'), '# Lantern Cove harbour\nHigh water at six.\n');
  expect(await linesOf(deps, working)).toEqual({ added: 2, removed: 1 });
  expect(diffs).toHaveLength(2);

  // Ended, it keeps its last count without looking.
  expect(await linesOf(deps, row({ worktree, endedAt: '2026-09-24T13:00:00.000Z' }))).toEqual({
    added: 2,
    removed: 1,
  });
  expect(diffs).toHaveLength(2);
});

test('a General or terminal session has no count', async () => {
  const { deps, row } = setUp();
  expect(await linesOf(deps, row({ project: GENERAL_PROJECT, cwd: '/tmp' }))).toBeUndefined();
  expect(await linesOf(deps, row({ agent: 'terminal' }))).toBeUndefined();
});
