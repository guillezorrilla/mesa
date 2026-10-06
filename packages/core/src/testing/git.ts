import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Runner } from '../lib/process.js';
import { profilePaths } from '../profile/paths.js';
import { testEnv, testRunner } from './env.js';

/** `run` with the real git in it, for the temp repositories; the rest stays as `run` answers. */
export const withRealGit =
  (run: Runner): Runner =>
  (file, args, ms, options) =>
    file === 'git' ? testRunner(file, args, ms, options) : run(file, args, ms, options);

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

/** Where Mesa puts `project`'s worktree for a branch folder, in the default profile. */
export const worktreeAt = (home: string, project: string, folder: string) =>
  join(profilePaths(home, 'default').worktrees, project, folder);

/** A repository's worktree count and branches, to compare before and after. */
export const repoState = (dir: string) => ({
  worktrees: testGit(dir, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length,
  branches: testGit(dir, 'branch', '--list', '--format=%(refname:short)'),
});
