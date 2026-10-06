import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gitCommand } from '../git/command.js';
import { MesaError } from '../lib/result.js';
import { worktreeCommand } from './create.js';
import {
  present,
  projectWorktrees,
  requireGit,
  type WorktreeAction,
  type WorktreeScope,
} from './facts.js';
import { listWorktrees } from './inventory.js';
import { previewWorktreeAction, type WorktreePreview } from './preview.js';

/** `force`: a remove past its local work (forceable); `deleteBranch`: a recycle's old branch, if merged. */
type ApplyOptions = { force?: boolean; deleteBranch?: boolean };

export type WorktreeApplied = {
  action: WorktreeAction;
  paths: string[];
  /** Cleanup: the registrations Git kept. */
  remaining?: string[];
  branch?: string;
  teardownRan?: boolean;
  forced?: boolean;
  base?: string;
  fetchFailed?: boolean;
  branchDeleted?: boolean;
  branchKept?: string;
  destination?: string;
};

/** One allowed action, after its preview's token matched. */
type Step = WorktreeScope & {
  root: string;
  preview: WorktreePreview;
  forced: boolean;
  opts: ApplyOptions;
};

const APPLY: Record<WorktreeAction, (step: Step) => Promise<WorktreeApplied>> = {
  cleanup: async ({ profile, run, store, project, root, preview }) => {
    await requireGit(run, root, ['worktree', 'prune', '--expire', 'now']);
    const remaining = (await listWorktrees(profile, run, store, project))
      .filter((row) => preview.paths.includes(row.path))
      .map((row) => row.path);
    return {
      action: 'cleanup',
      paths: preview.paths.filter((path) => !remaining.includes(path)),
      remaining,
    };
  },
  remove: async ({ root, preview, forced, ...scope }) => {
    const { run } = scope;
    const path = preview.paths[0] as string;
    let teardownRan = false;
    // The teardown the preview showed, which its token covers.
    if (preview.teardown?.length) {
      await worktreeCommand(run, path, preview.teardown, 'teardown');
      teardownRan = true;
      const after = await previewWorktreeAction(scope, 'remove', path);
      const still = forced ? after.allowed || after.forceable : after.allowed;
      if (!still || (!forced && (after.changes.length || after.ignored.length)))
        throw new MesaError('usage', `teardown ran, but ${path} changed; worktree preserved`);
    }
    try {
      await requireGit(run, root, [
        'worktree',
        'remove',
        ...(forced ? ['--force'] : []),
        '--',
        path,
      ]);
    } catch (error) {
      throw new MesaError(
        'usage',
        `${teardownRan ? 'teardown ran, but ' : ''}${String(error)}; ${await partialState(scope, path)}`,
      );
    }
    return {
      action: 'remove',
      paths: [path],
      branch: preview.branch,
      teardownRan,
      ...(forced ? { forced } : {}),
    };
  },
  recycle: async ({ run, root, preview, opts }) => {
    const path = preview.paths[0] as string;
    const base = preview.base as string;
    // The newest default branch, fetched first; offline, the one already fetched.
    const fetched = base.startsWith('origin/')
      ? (await gitCommand(run, root, ['fetch', '--prune', 'origin'], 60_000)).ok
      : true;
    await requireGit(run, path, ['switch', '--detach', base]);
    let branchKept: string | undefined;
    if (opts.deleteBranch && preview.branch) {
      // -d, not -D: a branch with work no other ref has stays, and the result says why.
      // From the worktree, now at the base, so merged means merged into the default branch.
      const deleted = await gitCommand(run, path, ['branch', '-d', '--', preview.branch]);
      if (!deleted.ok) branchKept = deleted.detail;
    }
    return {
      action: 'recycle',
      paths: [path],
      branch: preview.branch,
      base,
      ...(fetched ? {} : { fetchFailed: true }),
      ...(opts.deleteBranch && preview.branch && !branchKept ? { branchDeleted: true } : {}),
      ...(branchKept ? { branchKept } : {}),
    };
  },
  trash: async ({ root, preview, ...scope }) => {
    const { profile, run, project } = scope;
    const path = preview.paths[0] as string;
    const destination = preview.destination as string;
    mkdirSync(join(profile.paths.root, 'recycle', project), { recursive: true });
    if (present(destination))
      throw new MesaError('usage', 'recycle destination appeared; preview again');
    try {
      await requireGit(run, root, ['worktree', 'move', '--', path, destination]);
    } catch (error) {
      throw new MesaError(
        'usage',
        `${String(error)}; ${await partialState(scope, path, destination)}`,
      );
    }
    return { action: 'trash', paths: [path], destination, branch: preview.branch };
  },
};

/** A stale preview is re-read immediately before Git can prune its registrations. */
export async function applyWorktreeAction(
  scope: WorktreeScope,
  action: WorktreeAction,
  token: string,
  selected?: string,
  opts: ApplyOptions = {},
): Promise<WorktreeApplied> {
  const preview = await previewWorktreeAction(scope, action, selected);
  if (preview.token !== token)
    throw new MesaError('usage', 'worktree changed since preview; inspect it again');
  const forced = Boolean(opts.force && preview.forceable);
  if (!preview.allowed && !forced) throw new MesaError('usage', preview.reasons.join('; '));
  const { root } = await projectWorktrees(scope);
  return APPLY[action]({ ...scope, root, preview, forced, opts });
}

async function partialState(
  { profile, run, store, project }: WorktreeScope,
  source: string,
  destination?: string,
) {
  let registration = 'registration unknown';
  try {
    const row = (await listWorktrees(profile, run, store, project)).find(
      (entry) => entry.path === source || entry.path === destination,
    );
    registration = row ? `Git registers ${row.path}` : 'Git has no registration at either path';
  } catch {
    /* Git may be unavailable after a partial operation. */
  }
  return `source ${present(source) ? 'present' : 'missing'}${destination ? `, destination ${present(destination) ? 'present' : 'missing'}` : ''}; ${registration}`;
}
