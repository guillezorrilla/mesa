import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../process.js';
import { MesaError } from '../result.js';

// A session's own git worktree (CONTEXT.md, Worktree): git through the injected Runner.

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

/** git in `repo`: its stdout, or undefined when it fails. */
async function git(run: Runner, repo: string, args: string[], ms = ASK_MS) {
  const said = await run('git', ['-C', repo, ...args], ms);
  return said.ok ? said.stdout.trim() : undefined;
}

/** git in `repo`, or a usage error that starts with `why` and ends with git's reason. */
async function gitOrFail(run: Runner, repo: string, args: string[], why: string, ms = ASK_MS) {
  const said = await run('git', ['-C', repo, ...args], ms);
  if (!said.ok) throw new MesaError('usage', `${why}: ${said.detail}`);
  return said.stdout.trim();
}

/** The project's default branch: origin/HEAD, else the current branch. */
async function defaultBase(run: Runner, repo: string) {
  const base =
    (await git(run, repo, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'])) ||
    (await git(run, repo, ['symbolic-ref', '--short', '-q', 'HEAD']));
  if (!base)
    throw new MesaError('usage', `${repo} has no default branch to start from: pass --base`);
  return base;
}

/**
 * Adds a worktree for `branch` at `<root>/<branch, / as ->`: a new branch from `base` (default:
 * the project's default branch), or an existing branch not checked out elsewhere, reused as it
 * is. Every refusal is `usage`, with git's reason.
 */
export async function addWorktree(
  run: Runner,
  input: { repo: string; root: string; branch: string; base?: string },
): Promise<Worktree> {
  const { repo } = input;
  // ponytail: a project whose mesa.yaml sits below the repository's top starts at the worktree's
  // top; keep the subfolder when a project like that shows up.
  await gitOrFail(run, repo, ['rev-parse', '--show-toplevel'], `${repo} is not a git repository`);
  const branch = await git(run, repo, ['check-ref-format', '--branch', input.branch]);
  if (!branch) throw new MesaError('usage', `${input.branch} is not a valid branch name`);
  const path = join(input.root, branch.replaceAll('/', '-'));
  // Checked here: git makes a new branch before it finds the path taken, and leaves it behind.
  if (existsSync(path)) {
    throw new MesaError('usage', `${path} already exists: pick another branch, or remove it`);
  }
  const exists =
    (await git(run, repo, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) !==
    undefined;
  if (exists) {
    if (input.base !== undefined) {
      throw new MesaError(
        'usage',
        `branch ${branch} exists and is reused as it is: drop --base, or pick a new branch`,
      );
    }
    const add = ['worktree', 'add', '--quiet', '--end-of-options', path, branch];
    await gitOrFail(run, repo, add, `cannot check out ${branch}`, ADD_MS);
    return { path, branch };
  }
  const base = input.base ?? (await defaultBase(run, repo));
  const add = ['worktree', 'add', '--quiet', '-b', branch, '--end-of-options', path, base];
  await gitOrFail(run, repo, add, `cannot start ${branch} from ${base}`, ADD_MS);
  return { path, branch, base };
}

/**
 * Removes a worktree Mesa added, and its branch when Mesa made it (it has a base).
 * ponytail: forced and best effort, for a worktree whose session never started; #71 removes
 * one with work in it.
 */
export async function removeWorktree(run: Runner, repo: string, worktree: Worktree) {
  await git(run, repo, ['worktree', 'remove', '--force', worktree.path]);
  if (worktree.base !== undefined) await git(run, repo, ['branch', '-D', worktree.branch]);
}
