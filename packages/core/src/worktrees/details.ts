import { statSync } from 'node:fs';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import type { WorktreeRow } from './inventory.js';

/** What a Worktree card shows beyond Git's inventory, as Xirp's does. */
export type WorktreeDetails = {
  /** Uncommitted work: index changes, working-tree changes, and untracked files. */
  changes?: { staged: number; modified: number; untracked: number };
  /** Commits on it that the default branch does not have. */
  ahead?: number;
  /** When its folder was made: linked worktrees only. */
  createdAt?: string;
};

/** Counts `git status --porcelain=v1 -z`: a rename or copy carries its old path as one more field. */
export function countChanges(status: string) {
  const counts = { staged: 0, modified: 0, untracked: 0 };
  const fields = status.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] as string;
    if (field.length < 3) continue;
    const [x, y] = [field[0], field[1]];
    if (x === '?' && y === '?') counts.untracked++;
    else {
      if (x !== ' ') counts.staged++;
      if (y !== ' ') counts.modified++;
    }
    if (x === 'R' || x === 'C') i++;
  }
  return counts;
}

/**
 * Each row with its details, read side by side: a row whose folder Git cannot read (stale,
 * locked) keeps none. ponytail: one git status per worktree per list; cache by HEAD and index
 * mtime if projects grow past a few dozen worktrees.
 */
export async function withDetails(
  run: Runner,
  rows: readonly WorktreeRow[],
  base: string | undefined,
): Promise<(WorktreeRow & WorktreeDetails)[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.state === 'stale' || row.state === 'locked') return row;
      const [status, ahead] = await Promise.all([
        gitCommand(run, row.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
        base && row.head && !row.main
          ? gitCommand(run, row.path, ['rev-list', '--count', `${base}..${row.head}`])
          : undefined,
      ]);
      const changes = status.ok ? countChanges(status.stdout) : undefined;
      const count = ahead?.ok ? Number(ahead.stdout.trim()) : undefined;
      let createdAt: string | undefined;
      try {
        createdAt = row.main ? undefined : statSync(row.path).birthtime.toISOString();
      } catch {
        createdAt = undefined;
      }
      return {
        ...row,
        ...(changes ? { changes } : {}),
        ...(count === undefined || Number.isNaN(count) ? {} : { ahead: count }),
        ...(createdAt ? { createdAt } : {}),
      };
    }),
  );
}
