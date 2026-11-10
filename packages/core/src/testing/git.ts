import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../lib/process.js';
import { profilePaths } from '../profile/paths.js';
import { testEnv, testRunner } from './env.js';

/** The real binaries a worktree's carry probes the volume and clones with. */
const CARRY_BINARIES = ['/bin/df', '/usr/sbin/diskutil', '/bin/cp'];

/**
 * `run` with the real git in it, and the real binaries a worktree's carry runs, for the temp
 * repositories; the rest stays as `run` answers.
 */
export const withRealGit =
  (run: Runner): Runner =>
  (file, args, ms, options) =>
    file === 'git' || CARRY_BINARIES.includes(file)
      ? testRunner(file, args, ms, options)
      : run(file, args, ms, options);

/** git in `dir`, as a person would type it, its output trimmed. */
export const testGit = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: testEnv,
  }).trim();

/** `dir` as a git repository on main, its files in one commit. */
export function gitRepo(dir: string) {
  testGit(dir, 'init', '-q', '-b', 'main');
  testGit(dir, 'add', '-A');
  testGit(dir, 'commit', '-q', '-m', 'init');
}

/** Writes `file` in the checkout `cwd` and commits it. */
export function commitFile(cwd: string, file: string, text: string) {
  writeFileSync(join(cwd, file), text);
  testGit(cwd, 'add', file);
  testGit(cwd, 'commit', '-q', '-m', `Write ${file}`);
}

/**
 * A merge in `dir`, a gitRepo, stopped on a conflict: branches `main` and `swell` each change the
 * `lines` lines of `tide.ts`, and `swell` is merged into `main`.
 */
export function mergeConflict(dir: string, lines = 1) {
  const tide = (height: number) =>
    Array.from({ length: lines }, (_, i) => `export const high${i || ''} = ${height};\n`).join('');
  writeFileSync(join(dir, 'tide.ts'), tide(6));
  testGit(dir, 'add', 'tide.ts');
  testGit(dir, 'commit', '-q', '-m', 'Add the tide');
  testGit(dir, 'switch', '-q', '-c', 'swell');
  writeFileSync(join(dir, 'tide.ts'), tide(7));
  testGit(dir, 'commit', '-q', '-am', 'Raise the tide');
  testGit(dir, 'switch', '-q', 'main');
  writeFileSync(join(dir, 'tide.ts'), tide(5));
  testGit(dir, 'commit', '-q', '-am', 'Lower the tide');
  // A conflicted merge exits 1, which testGit would throw on.
  spawnSync(
    'git',
    ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'merge', '-q', 'swell'],
    {
      env: testEnv,
    },
  );
}

/** Where Mesa puts `project`'s worktree for a branch folder, in the default profile. */
export const worktreeAt = (home: string, project: string, folder: string) =>
  join(profilePaths(home, 'default').worktrees, project, folder);

/** A repository's worktree count and branches, to compare before and after. */
export const repoState = (dir: string) => ({
  worktrees: testGit(dir, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length,
  branches: testGit(dir, 'branch', '--list', '--format=%(refname:short)'),
});
