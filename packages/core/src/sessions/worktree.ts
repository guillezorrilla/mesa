import { existsSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../process.js';
import { MesaError } from '../result.js';

// A session's own git worktree (CONTEXT.md, Worktree): git through the injected Runner.
// ponytail: git inherits mesa's environment, so a GIT_DIR exported around mesa (a git hook runs
// it) points git at that repository instead; pass git a clean environment if mesa runs there.

/** Where a session's worktree is, its branch, and the ref a new branch started from. */
export type Worktree = {
  path: string;
  branch: string;
  /** Absent when an existing branch was reused as it is. */
  base?: string;
};

// ponytail: a checkout of a large repository takes a while; 60 s, raise it when one takes longer.
const ADD_MS = 60_000;
const ASK_MS = 5_000;

/** One git call in `repo`. A missing or hung git throws; a failed command returns. */
async function git(run: Runner, repo: string, args: string[], ms = ASK_MS) {
  const res = await run('git', ['-C', repo, ...args], ms);
  if (res.ok || res.reason === 'failed') return res;
  throw new MesaError(
    'internal',
    res.reason === 'missing'
      ? 'git not found on PATH; --branch needs it'
      : `git did not answer within ${ms / 1000} s`,
  );
}

/** git's answer, or undefined when it says no. */
async function ask(run: Runner, repo: string, args: string[]) {
  const res = await git(run, repo, args);
  return res.ok ? res.stdout.trim() : undefined;
}

/** A git call that must succeed: its failure is `usage`, `why` then git's reason. */
async function must(run: Runner, repo: string, args: string[], why: string, ms = ASK_MS) {
  const res = await git(run, repo, args, ms);
  if (!res.ok) throw new MesaError('usage', `${why}: ${res.detail}`);
  return res.stdout.trim();
}

/** A new branch's default start: the branch on origin, else origin/HEAD, else the current one. */
async function defaultBase(run: Runner, repo: string, branch: string) {
  const onOrigin = await ask(run, repo, ['show-ref', '--verify', `refs/remotes/origin/${branch}`]);
  const base =
    (onOrigin && `origin/${branch}`) ||
    (await ask(run, repo, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'])) ||
    (await ask(run, repo, ['symbolic-ref', '--short', '-q', 'HEAD']));
  if (!base) {
    throw new MesaError('usage', `${repo} has no default branch to start from: pass --base`);
  }
  return base;
}

/**
 * Adds a worktree for `branch` at `<root>/<branch, / as ->`: an existing branch not checked out
 * elsewhere, reused as it is, or a new one from `base` (defaultBase), tracking nothing, so a push
 * never lands on the branch it started from. `repo` must be a repository's top folder. Every
 * refusal is `usage`; a failed add removes what it made.
 */
export async function addWorktree(
  run: Runner,
  input: { repo: string; root: string; branch: string; base?: string },
): Promise<Worktree> {
  const { repo, branch } = input;
  const top = await must(
    run,
    repo,
    ['rev-parse', '--show-toplevel'],
    `${repo} is not a git repository`,
  );
  if (top !== realpathSync(repo)) {
    throw new MesaError(
      'usage',
      `${repo} is inside the git repository ${top}, not its top folder: --branch needs a project there`,
    );
  }
  // git prints the name it would use: a different one (`@{-1}`) is not the branch asked for.
  if ((await ask(run, repo, ['check-ref-format', '--branch', branch])) !== branch) {
    throw new MesaError('usage', `${branch} is not a valid branch name`);
  }
  const path = join(input.root, branch.replaceAll('/', '-'));
  // So everything at `path` after a failed add is git's, and removing it takes nothing else.
  if (existsSync(path)) {
    throw new MesaError('usage', `${path} already exists: pick another branch, or remove it`);
  }
  const local = await ask(run, repo, ['show-ref', '--verify', `refs/heads/${branch}`]);
  if (local !== undefined && input.base !== undefined) {
    throw new MesaError(
      'usage',
      `branch ${branch} exists and is reused as it is: drop --base, or pick a new branch`,
    );
  }
  const base =
    local === undefined ? (input.base ?? (await defaultBase(run, repo, branch))) : undefined;
  const worktree: Worktree = { path, branch, ...(base === undefined ? {} : { base }) };
  const args =
    base === undefined
      ? ['worktree', 'add', '--quiet', '--end-of-options', path, branch]
      : ['worktree', 'add', '--quiet', '--no-track', '-b', branch, '--end-of-options', path, base];
  const why =
    base === undefined ? `cannot check out ${branch}` : `cannot start ${branch} from ${base}`;
  let added = false;
  try {
    await must(run, repo, args, why, ADD_MS);
    added = true;
  } finally {
    // git leaves a new branch, and a killed one a half-made folder.
    if (!added) await removeWorktree(run, repo, worktree);
  }
  return worktree;
}

/**
 * Removes a worktree addWorktree made, and its branch when that made it too (it has a base).
 * ponytail: forced and best effort, for a worktree whose session never started; #71 removes one
 * with work in it.
 */
export async function removeWorktree(run: Runner, repo: string, worktree: Worktree) {
  const quietly = (args: string[]) => git(run, repo, args).catch(() => undefined);
  await quietly(['worktree', 'remove', '--force', worktree.path]);
  rmSync(worktree.path, { recursive: true, force: true });
  if (worktree.base !== undefined) await quietly(['branch', '-D', worktree.branch]);
}
