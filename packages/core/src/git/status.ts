import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from '../projects/checkout.js';
import { gitCommand } from './command.js';
import { currentBranch } from './ref.js';

export type GitChange = {
  path: string;
  oldPath?: string;
  index: string;
  workingTree: string;
  /** Unmerged (`DD`, `AU`, `UD`, `UA`, `DU`, `AA`, `UU`): its conflict is not resolved yet. */
  conflicted?: true;
};
/** A merge, rebase or cherry-pick the checkout is in the middle of. */
export type GitOperation = 'merge' | 'rebase' | 'cherry-pick';
export type GitStatus = {
  checkout: Checkout;
  branch: string | null;
  changes: GitChange[];
  /** The operation in progress, which a conflict stops until it is resolved; null with none. */
  operation: GitOperation | null;
  /** The hooks a commit runs here: `preCommit` while the resolved `hooks/pre-commit` is executable. */
  hooks: { preCommit: boolean };
};

/** Whether `path` is a file this user may run. */
function executable(path: string) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Whether a commit in `cwd` runs a pre-commit hook: `--git-path` follows `core.hooksPath`. */
async function hasPreCommit(run: Runner, cwd: string) {
  const hook = await gitCommand(run, cwd, ['rev-parse', '--git-path', 'hooks/pre-commit']);
  return hook.ok && executable(resolve(cwd, hook.stdout.trim()));
}

const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/** What git leaves in the checkout's git dir while each operation is in progress; a rebase first, as it can leave the others too. */
const OPERATION_MARKS: [GitOperation, string[]][] = [
  ['rebase', ['rebase-merge', 'rebase-apply']],
  ['merge', ['MERGE_HEAD']],
  ['cherry-pick', ['CHERRY_PICK_HEAD']],
];

/** The merge, rebase or cherry-pick stopped in the checkout at `cwd`, if any. */
export async function operationIn(run: Runner, cwd: string): Promise<GitOperation | null> {
  const dir = await gitCommand(run, cwd, ['rev-parse', '--absolute-git-dir']);
  if (!dir.ok) return null;
  // `git am` keeps its state in rebase-apply too, marked by `applying`: not a rebase.
  if (existsSync(join(dir.stdout.trim(), 'rebase-apply', 'applying'))) return null;
  const found = OPERATION_MARKS.find(([, marks]) =>
    marks.some((mark) => existsSync(join(dir.stdout.trim(), mark))),
  );
  return found?.[0] ?? null;
}

/** Porcelain v1 with NUL paths keeps spaces, newlines and rename sources literal. */
function changesOf(output: string): GitChange[] {
  const fields = output.split('\0');
  const changes: GitChange[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const index = field[0] ?? ' ';
    const workingTree = field[1] ?? ' ';
    const path = field.slice(3);
    const renamed = index === 'R' || index === 'C' || workingTree === 'R' || workingTree === 'C';
    const oldPath = renamed ? fields[++i] : undefined;
    changes.push({
      path,
      index,
      workingTree,
      ...(oldPath === undefined ? {} : { oldPath }),
      ...(UNMERGED.has(index + workingTree) ? { conflicted: true as const } : {}),
    });
  }
  return changes;
}

export async function readGitStatus(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<GitStatus> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const [branch, status, preCommit, operation] = await Promise.all([
    currentBranch(run, checkout.path),
    gitCommand(run, checkout.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    hasPreCommit(run, checkout.path),
    operationIn(run, checkout.path),
  ]);
  if (!status.ok) throw new MesaError('usage', `cannot read Git status: ${status.detail}`);
  return {
    checkout,
    branch,
    changes: changesOf(status.stdout),
    operation,
    hooks: { preCommit },
  };
}
