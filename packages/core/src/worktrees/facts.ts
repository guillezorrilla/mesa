import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { checkoutHolders, heldWorktrees, real } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';
import { defaultBranchRef } from './base.js';
import { listWorktrees, type WorktreeRow } from './inventory.js';
import { worktreeScript } from './settings.js';

/**
 * remove deletes a linked checkout; recycle resets it for reuse, detached at the default branch;
 * trash moves it, with its files and branch, into the profile's recycle/; cleanup prunes
 * missing registrations.
 */
export type WorktreeAction = 'remove' | 'recycle' | 'trash' | 'cleanup';

/** What a cleanup reads: the registrations Git would prune and who references them. */
export type CleanupFacts = {
  kind: 'cleanup';
  rows: WorktreeRow[];
  /** Stale registrations whose folder is gone. */
  missing: string[];
  holders: string[];
  /** Stale registrations whose folder is still there. */
  onDisk: string[];
};

/** What an action on one linked worktree reads: its registration, sessions, and local work. */
export type CheckoutFacts = {
  kind: 'checkout';
  path: string;
  branch?: string;
  head?: string;
  state: WorktreeRow['state'];
  inode: number;
  device: number;
  /** Every session that references the worktree, running or retaining it. */
  holders: string[];
  /** The sessions running in it now. */
  live: string[];
  status: string;
  ignoredOutput: string;
  changes: string[];
  ignored: string[];
  upstream: string;
  ahead?: number;
  unpublished: boolean;
  /** A remove's teardown script. */
  teardown?: string[];
  /** The ref a recycle resets to. */
  base?: string;
};

/** Git's answer, or the command's failure as a usage error. */
export async function requireGit(run: Runner, repo: string, args: string[]) {
  const result = await gitCommand(run, repo, args, 60_000);
  if (!result.ok) throw new MesaError('usage', `git ${args[0]} failed: ${result.detail}`);
  return result.stdout;
}

export const present = (path: string) => Boolean(lstatSync(path, { throwIfNoEntry: false }));

/** The project's registered worktrees and its main checkout. */
export async function projectWorktrees(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
) {
  const rows = await listWorktrees(profile, run, store, project);
  const root = rows.find((row) => row.main)?.path;
  if (!root) throw new MesaError('usage', `${project} has no main checkout`);
  return { rows, root };
}

export function cleanupFacts(
  store: SessionStore,
  project: string,
  root: string,
  rows: WorktreeRow[],
): CleanupFacts {
  const stale = rows.filter((row) => row.state === 'stale' && !present(row.path));
  return {
    kind: 'cleanup',
    rows,
    missing: stale.map((row) => row.path).sort(),
    holders: stale.flatMap((row) => references(store, project, root, row.path)),
    onDisk: rows.filter((row) => row.state === 'stale' && present(row.path)).map((row) => row.path),
  };
}

/** Reads the selected linked worktree; `action` adds what only it needs (base, teardown). */
export async function checkoutFacts(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  { rows, root }: { rows: WorktreeRow[]; root: string },
  action: WorktreeAction,
  selected?: string,
): Promise<CheckoutFacts> {
  if (!selected || !isAbsolute(selected))
    throw new MesaError('usage', 'select an absolute linked worktree path');
  let path: string;
  try {
    path = realpathSync.native(selected);
  } catch {
    throw new MesaError('not_found', `worktree ${selected} is unavailable`);
  }
  const row = rows.find((candidate) => candidate.path === path);
  if (!row || row.main) throw new MesaError('usage', `${path} is not a linked project worktree`);
  const stat = lstatSync(path);
  const holders = references(store, project, root, path);
  const live = checkoutHolders(store.list(), project, root, path).map((record) => record.id);
  const base =
    action === 'recycle' ? await defaultBranchRef(profile, run, root, project) : undefined;
  const status = await requireGit(run, path, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  const ignoredOutput = await requireGit(run, path, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    // One row per ignored folder, not per file: node_modules alone can list 100k paths.
    '--directory',
    '-z',
  ]);
  const branch = row.branch;
  const [tracked = '', track = ''] = branch
    ? (
        await requireGit(run, root, [
          'for-each-ref',
          '--format=%(upstream:short)%00%(upstream:track)',
          `refs/heads/${branch}`,
        ])
      )
        .trim()
        .split('\0')
    : [];
  // A deleted remote branch (a merged PR) is no upstream; `containing` decides then.
  const upstream = track === '[gone]' ? '' : tracked;
  const ahead =
    upstream && branch
      ? Number(
          (await requireGit(run, root, ['rev-list', '--count', `${upstream}..${branch}`])).trim(),
        )
      : undefined;
  const containing = row.head
    ? (
        await requireGit(run, root, [
          'for-each-ref',
          `--contains=${row.head}`,
          '--format=%(refname)',
          'refs/remotes',
        ])
      )
        .split('\n')
        .filter(Boolean)
    : [];
  return {
    kind: 'checkout',
    path,
    ...(branch ? { branch } : {}),
    ...(row.head ? { head: row.head } : {}),
    state: row.state,
    inode: stat.ino,
    device: stat.dev,
    holders,
    live,
    status,
    ignoredOutput,
    changes: status.split('\0').filter(Boolean),
    ignored: ignoredOutput.split('\0').filter(Boolean),
    upstream,
    ...(ahead === undefined ? {} : { ahead }),
    unpublished: (ahead ?? 0) > 0 || !branch || containing.length === 0,
    ...(action === 'remove'
      ? { teardown: worktreeScript(profile, findProject(profile, project), 'teardown') }
      : {}),
    ...(base ? { base } : {}),
  };
}

function references(store: SessionStore, project: string, root: string, path: string) {
  const records = store.list();
  const live = checkoutHolders(records, project, root, path).map((record) => record.id);
  const retained = records.flatMap((record) =>
    heldWorktrees(record).some(
      ({ project: of, worktree }) => of === project && real(worktree.path) === path,
    )
      ? [record.id]
      : [],
  );
  return [...new Set([...live, ...retained])].sort();
}
