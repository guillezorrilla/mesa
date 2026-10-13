import { readWorkspaceFile } from '../files/editor.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from '../projects/checkout.js';
import { findProject } from '../projects/projects.js';
import { defaultBranchRef } from '../worktrees/base.js';
import { gitCommand } from './command.js';
import { type DiffRow, diffRows } from './diff.js';
import { commitOid } from './ref.js';

// ponytail: untracked files past this many are left out; page them if a checkout ever needs more.
const MAX_UNTRACKED = 200;

export type GitBranchDiff = {
  checkout: Checkout;
  /** The ref the checkout branched from, as given or the project's default branch. */
  base: string;
  /** Where the checkout left `base`: everything after it, committed or not, is in the patch. */
  mergeBase: string;
  /** Commits on HEAD since the merge-base. */
  ahead: number;
  patch: string;
  rows: DiffRow[];
};

/** An untracked file as Git would print it once added: every line new. */
function untrackedPatch(checkout: Checkout, path: string): string {
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
  try {
    const { text } = readWorkspaceFile(checkout, path);
    if (!text) return header;
    const lines = text.replace(/\n$/, '').split('\n');
    return `${header}@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}\n`;
  } catch (error) {
    // Binary, over the editor's size limit, or behind a symlink: listed, never shown.
    return `${header}${error instanceof MesaError ? error.message : `${path} cannot be read`}\n`;
  }
}

/**
 * Everything a checkout holds that `base` lacks: its commits since the merge-base, staged and
 * unstaged edits, and untracked files, as one patch. `base` defaults to the project's default branch.
 */
export async function readBranchDiff(
  profile: Profile,
  run: Runner,
  project: string,
  base?: string,
  selected?: string,
): Promise<GitBranchDiff> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const ref =
    base ?? (await defaultBranchRef(profile, run, findProject(profile, project).path, project));
  if (!ref) throw new MesaError('usage', `${project} has no default branch to compare with`);
  const baseOid = await commitOid(run, checkout.path, ref).catch(() => {
    throw new MesaError('usage', `base branch ${ref} is not in this checkout`);
  });
  const found = await gitCommand(run, checkout.path, ['merge-base', baseOid, 'HEAD']);
  if (!found.ok) throw new MesaError('usage', `${ref} shares no history with this checkout`);
  const mergeBase = found.stdout.trim();
  const [count, tracked, others] = await Promise.all([
    gitCommand(run, checkout.path, ['rev-list', '--count', `${mergeBase}..HEAD`]),
    gitCommand(
      run,
      checkout.path,
      ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', mergeBase, '--'],
      30_000,
    ),
    gitCommand(run, checkout.path, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  if (!tracked.ok) throw new MesaError('usage', `cannot read changes: ${tracked.detail}`);
  const untracked = others.ok ? others.stdout.split('\0').filter(Boolean) : [];
  const patch =
    tracked.stdout +
    untracked
      .slice(0, MAX_UNTRACKED)
      .map((path) => untrackedPatch(checkout, path))
      .join('');
  return {
    checkout,
    base: ref,
    mergeBase,
    ahead: count.ok ? Number(count.stdout.trim()) : 0,
    patch,
    rows: diffRows(patch),
  };
}
