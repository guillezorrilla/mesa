import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { gitCommand } from './command.js';

export type GitWorktree = {
  path: string;
  head?: string;
  branch?: string;
  detached?: boolean;
  locked?: string;
  prunable?: string;
  bare?: boolean;
};

/** Git's stable NUL-delimited worktree inventory, including stale and locked records. */
export async function gitWorktrees(run: Runner, root: string): Promise<GitWorktree[]> {
  const listed = await gitCommand(run, root, ['worktree', 'list', '--porcelain', '-z']);
  if (!listed.ok) throw new MesaError('usage', `cannot list worktrees: ${listed.detail}`);
  const rows: GitWorktree[] = [];
  let row: GitWorktree | undefined;
  for (const field of listed.stdout.split('\0')) {
    if (!field) {
      if (row) rows.push(row);
      row = undefined;
    } else if (field.startsWith('worktree ')) row = { path: field.slice(9) };
    else if (row && field.startsWith('HEAD ')) row.head = field.slice(5);
    else if (row && field.startsWith('branch refs/heads/')) row.branch = field.slice(18);
    else if (row && field === 'detached') row.detached = true;
    else if (row && field === 'bare') row.bare = true;
    else if (row && field.startsWith('locked')) row.locked = field.slice(7);
    else if (row && field.startsWith('prunable')) row.prunable = field.slice(9);
  }
  if (row) rows.push(row);
  return rows;
}
