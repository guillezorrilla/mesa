import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gitCommand } from '../../git/command.js';
import { type AsyncLockDeps, lockedBy, withLock } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';

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
  return gitCommand(run, repo, args, ms, 'git not found on PATH; --branch needs it');
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

/** Refuses `repo` unless it is a git repository's top folder, where a worktree is added from. */
export async function requireGitTop(run: Runner, repo: string) {
  const below = await must(
    run,
    repo,
    ['rev-parse', '--show-prefix'],
    `${repo} is not a git repository`,
  );
  if (below) {
    throw new MesaError(
      'usage',
      `${repo} is below the top folder of its git repository: --branch needs a project at the top`,
    );
  }
}

/**
 * Where addWorktree puts `branch`'s worktree under `root`: a `/` in it becomes `-`. Absolute, as
 * git also finds a worktree by the end of a relative path.
 */
export const worktreePath = (root: string, branch: string) =>
  resolve(root, branch.replaceAll('/', '-'));

/**
 * Adds a worktree for `branch` at worktreePath: an existing branch not checked out elsewhere,
 * reused as it is, or a new one from `base` (defaultBase). A new branch tracks only the branch of
 * its name on origin, so a push never lands on the branch it started from.
 * ponytail: a `git branch` that hangs past 5 s may leave its branch, which a retry then reuses. `repo` must be a
 * repository's top folder. Every refusal is `usage`; a failed add removes what it made, and only
 * that: the path is claimed with one mkdir first, and the branch made in its own step.
 */
export async function addWorktree(
  run: Runner,
  lock: AsyncLockDeps,
  input: {
    repo: string;
    root: string;
    branch: string;
    base?: string;
    defaultBase?: string;
    fetch?: boolean;
  },
): Promise<Worktree> {
  const { repo, branch } = input;
  await requireGitTop(run, repo);
  // git prints the name it would use: a different one (`@{-1}`) is not the branch asked for.
  if ((await ask(run, repo, ['check-ref-format', '--branch', branch])) !== branch) {
    throw new MesaError('usage', `${branch} is not a valid branch name`);
  }
  if (input.fetch)
    await must(
      run,
      repo,
      ['fetch', '--all', '--prune'],
      'cannot fetch before worktree creation',
      ADD_MS,
    );
  const local = await ask(run, repo, ['show-ref', '--verify', `refs/heads/${branch}`]);
  // A create killed after it made the branch left it on its base: a retry reuses it.
  const reused =
    local !== undefined &&
    input.base !== undefined &&
    local.split(' ')[0] ===
      (await ask(run, repo, ['rev-parse', '--verify', '--quiet', `${input.base}^{commit}`]));
  if (local !== undefined && input.base !== undefined && !reused) {
    throw new MesaError(
      'usage',
      `branch ${branch} exists and is reused as it is: drop --base, or pick a new branch`,
    );
  }
  const base =
    local === undefined
      ? (input.base ?? input.defaultBase ?? (await defaultBase(run, repo, branch)))
      : undefined;
  const path = worktreePath(input.root, branch);
  mkdirSync(input.root, { recursive: true });
  // One create at a path at a time, so a folder found empty there is one a killed create left.
  const lockPath = `${path}.lock`;
  return withLock(
    lock,
    lockPath,
    async () => {
      // Before the claim, so a registration at the path after it can only be this call's. git lists
      // real paths.
      const real = join(realpathSync.native(input.root), basename(path));
      const listed = await must(
        run,
        repo,
        ['worktree', 'list', '--porcelain'],
        'cannot list worktrees',
      );
      if (listed.split('\n').includes(`worktree ${real}`)) {
        throw new MesaError(
          'usage',
          `git lists a worktree at ${path} already: pick another branch, or see git worktree list`,
        );
      }
      claim(path);
      let made = false;
      let added = false;
      try {
        if (base !== undefined) {
          const start = ['branch', '--quiet', '--no-track', '--end-of-options', branch, base];
          await must(run, repo, start, `cannot start ${branch} from ${base}`);
          made = true;
          // Continued from origin, it pulls from there; best effort, as a single-branch clone's
          // fetched ref is not a branch git tracks.
          if (base === `origin/${branch}`) {
            await ask(run, repo, ['branch', '--quiet', `--set-upstream-to=${base}`, branch]);
          }
        }
        const add = ['worktree', 'add', '--quiet', '--end-of-options', path, branch];
        await must(run, repo, add, `cannot check out ${branch}`, ADD_MS);
        added = true;
      } finally {
        // A killed add leaves a half-made folder, and perhaps its registration.
        if (!added) await discard(run, repo, path, made ? branch : undefined);
      }
      const started = base ?? (reused ? input.base : undefined);
      return { path, branch, ...(started === undefined ? {} : { base: started }) };
    },
    () => lockedBy(`the worktree ${path}`, lockPath, 'worktree'),
  );
}

/** An empty folder, as a create killed before git's add leaves at its path. */
export const isLeftover = (path: string) => {
  const found = lstatSync(path, { throwIfNoEntry: false });
  return found?.isDirectory() === true && readdirSync(path).length === 0;
};

/**
 * Makes `path`, empty, for this call: one that exists refuses, even a dangling link, unless it is
 * an empty folder git does not list (the caller checked), which a create killed before its add
 * left behind.
 * addWorktree holds the path's lock, so no other create is making that folder.
 */
function claim(path: string) {
  try {
    mkdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (isLeftover(path)) return;
    throw new MesaError('usage', `${path} already exists: pick another branch, or remove it`);
  }
}

/** Removes the worktree at `path`, and `branch` when given: best effort, forced. */
async function discard(run: Runner, repo: string, path: string, branch?: string) {
  // As long as an add may take: a remove cut short leaves the registration, and the branch.
  const quietly = (args: string[]) => git(run, repo, args, ADD_MS).catch(() => undefined);
  await quietly(['worktree', 'remove', '--force', path]);
  rmSync(path, { recursive: true, force: true });
  if (branch !== undefined) await quietly(['branch', '-D', branch]);
}

/**
 * Removes a worktree addWorktree made, and its branch when that made it too (it has a base).
 * ponytail: forced, for a worktree whose session never started; #71 removes one with work in it.
 */
export const removeWorktree = (run: Runner, repo: string, worktree: Worktree) =>
  discard(run, repo, worktree.path, worktree.base === undefined ? undefined : worktree.branch);

/**
 * Removes a session's worktree with work in it (mesa rm --delete-worktree): git refuses one with
 * changes or untracked files unless `force`, and that refusal is usage with git's reason.
 */
export async function deleteWorktree(
  run: Runner,
  repo: string,
  worktree: Worktree,
  { force = false } = {},
) {
  const args = [
    'worktree',
    'remove',
    ...(force ? ['--force'] : []),
    '--end-of-options',
    worktree.path,
  ];
  await must(run, repo, args, `cannot remove the worktree ${worktree.path}`, ADD_MS);
}

/** Whether a worktree has an initialized submodule: git keeps its git data in the worktree's `modules`. */
export async function hasSubmodules(run: Runner, path: string) {
  const modules = await ask(run, path, ['rev-parse', '--git-path', 'modules']);
  return modules !== undefined && existsSync(resolve(path, modules));
}

/**
 * Deletes a session's branch (mesa rm --delete-branch); git refuses one checked out elsewhere. One
 * already gone (an rm retried after a git failure) is left as it is.
 */
export async function deleteBranch(run: Runner, repo: string, branch: string) {
  if ((await ask(run, repo, ['show-ref', '--verify', `refs/heads/${branch}`])) === undefined)
    return;
  await must(
    run,
    repo,
    ['branch', '-D', '--end-of-options', branch],
    `cannot delete branch ${branch}`,
  );
}
