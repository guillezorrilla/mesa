import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { checkoutHolders, heldWorktrees, real } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';
import { defaultBranchRef } from './base.js';
import { worktreeCommand } from './create.js';
import { listWorktrees, type WorktreeRow } from './inventory.js';
import { worktreeScript } from './settings.js';

/**
 * remove deletes a linked checkout; recycle resets it for reuse, detached at the default branch;
 * trash moves it, with its files and branch, into the profile's recycle/; cleanup prunes
 * missing registrations.
 */
export type WorktreeAction = 'remove' | 'recycle' | 'trash' | 'cleanup';
export type WorktreePreview = {
  action: WorktreeAction;
  project: string;
  token: string;
  paths: string[];
  branch?: string;
  head?: string;
  state?: WorktreeRow['state'];
  holders: string[];
  changes: string[];
  ignored: string[];
  upstream?: string;
  ahead?: number;
  unpublished: boolean;
  teardown?: string[];
  destination?: string;
  /** The ref a recycle resets to. */
  base?: string;
  allowed: boolean;
  reasons: string[];
  /** A remove that `force` may apply anyway: every reason is local work, none a live session. */
  forceable: boolean;
};

async function requireGit(run: Runner, repo: string, args: string[]) {
  const result = await gitCommand(run, repo, args, 60_000);
  if (!result.ok) throw new MesaError('usage', `git ${args[0]} failed: ${result.detail}`);
  return result.stdout;
}

const fingerprint = (facts: unknown) =>
  createHash('sha256').update(JSON.stringify(facts)).digest('hex');

const present = (path: string) => Boolean(lstatSync(path, { throwIfNoEntry: false }));

/** Preview the exact Git registration and local work that an action would affect. */
export async function previewWorktreeAction(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  action: WorktreeAction,
  selected?: string,
): Promise<WorktreePreview> {
  const rows = await listWorktrees(profile, run, store, project);
  const root = rows.find((row) => row.main)?.path;
  if (!root) throw new MesaError('usage', `${project} has no main checkout`);
  if (action === 'cleanup') {
    const stale = rows.filter((row) => row.state === 'stale' && !present(row.path));
    const paths = stale.map((row) => row.path).sort();
    const holders = stale.flatMap((row) => references(store, project, root, row.path));
    // `git worktree prune` takes every prunable registration, not only the missing ones shown.
    const onDisk = rows.filter((row) => row.state === 'stale' && present(row.path));
    const reasons = [
      ...(!paths.length ? ['no missing worktrees to clean'] : []),
      ...(holders.length ? ['a session still references a missing worktree'] : []),
      ...onDisk.map(
        (row) => `${row.path} is prunable but still on disk; repair or remove it first`,
      ),
    ];
    const facts = {
      action,
      project,
      rows: rows.map(({ path, head, branch, state }) => ({ path, head, branch, state })),
      paths,
      holders,
    };
    return {
      action,
      project,
      token: fingerprint(facts),
      paths,
      holders,
      changes: [],
      ignored: [],
      unpublished: false,
      allowed: !reasons.length,
      reasons,
      forceable: false,
    };
  }
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
  const changes = status.split('\0').filter(Boolean);
  const ignored = ignoredOutput.split('\0').filter(Boolean);
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
  const unpublished = (ahead ?? 0) > 0 || !branch || containing.length === 0;
  const facts = {
    action,
    project,
    path,
    branch,
    head: row.head,
    state: row.state,
    inode: stat.ino,
    device: stat.dev,
    holders,
    status,
    ignoredOutput,
    upstream,
    ahead,
    unpublished,
    teardown:
      action === 'remove'
        ? worktreeScript(profile, findProject(profile, project), 'teardown')
        : undefined,
    base,
  };
  const token = fingerprint(facts);
  const destination =
    action === 'trash'
      ? join(profile.paths.root, 'recycle', project, `${basename(path)}-${token.slice(0, 12)}`)
      : undefined;
  // What no force passes: the worktree's state, a session running in it, and what the action needs.
  const blocked = [
    ...(row.state !== 'ready' &&
    row.state !== 'detached' &&
    !(action === 'remove' && row.state === 'recycled')
      ? [`worktree is ${row.state}`]
      : []),
    ...(live.length ? [`session ${live.join(', ')} runs in this worktree; stop it first`] : []),
    ...(action === 'trash' && holders.length > live.length
      ? ['a session still references this worktree']
      : []),
    ...(action === 'recycle' && changes.length
      ? ['worktree has uncommitted changes; commit, stash, or trash it']
      : []),
    ...(action === 'recycle' && !base ? ['no default branch to reset to'] : []),
    // A branch keeps its commits through a recycle; a detached HEAD's would be left to the reflog.
    ...(action === 'recycle' && !branch && unpublished
      ? ['detached HEAD has commits no branch holds; make a branch or trash it']
      : []),
    ...(destination && present(destination) ? ['recycle destination already exists'] : []),
  ];
  // The local work a remove would lose, which a confirmed force removes anyway.
  const work =
    action === 'remove'
      ? [
          ...(holders.length > live.length ? ['a session still references this worktree'] : []),
          ...(changes.length ? ['worktree has changed or untracked files'] : []),
          ...(ignored.length ? ['worktree has ignored files'] : []),
          ...(unpublished ? ['branch has unpublished commits or is detached'] : []),
        ]
      : [];
  const reasons = [...blocked, ...work];
  return {
    action,
    project,
    token,
    paths: [path],
    ...(branch ? { branch } : {}),
    ...(row.head ? { head: row.head } : {}),
    state: row.state,
    holders,
    changes,
    ignored,
    ...(upstream ? { upstream } : {}),
    ...(ahead === undefined ? {} : { ahead }),
    unpublished,
    ...(action === 'remove' ? { teardown: facts.teardown } : {}),
    ...(destination ? { destination } : {}),
    ...(base ? { base } : {}),
    allowed: !reasons.length,
    reasons,
    forceable: !blocked.length && work.length > 0,
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

/** A stale preview is re-read immediately before Git can prune its registrations. */
export async function applyWorktreeAction(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  action: WorktreeAction,
  token: string,
  selected?: string,
  /** `force`: a remove past its local work (forceable); `deleteBranch`: a recycle's old branch, if merged. */
  opts: { force?: boolean; deleteBranch?: boolean } = {},
) {
  const preview = await previewWorktreeAction(profile, run, store, project, action, selected);
  if (preview.token !== token)
    throw new MesaError('usage', 'worktree changed since preview; inspect it again');
  const forced = Boolean(opts.force && preview.forceable);
  if (!preview.allowed && !forced) throw new MesaError('usage', preview.reasons.join('; '));
  const root = (await listWorktrees(profile, run, store, project)).find((row) => row.main)?.path;
  if (!root) throw new MesaError('usage', `${project} has no main checkout`);
  if (action === 'cleanup') {
    await requireGit(run, root, ['worktree', 'prune', '--expire', 'now']);
    const remaining = (await listWorktrees(profile, run, store, project))
      .filter((row) => preview.paths.includes(row.path))
      .map((row) => row.path);
    return { action, paths: preview.paths.filter((path) => !remaining.includes(path)), remaining };
  }
  const path = preview.paths[0] as string;
  if (action === 'remove') {
    let teardownRan = false;
    // The teardown the preview showed, which its token covers.
    if (preview.teardown?.length) {
      await worktreeCommand(run, path, preview.teardown, 'teardown');
      teardownRan = true;
      const after = await previewWorktreeAction(profile, run, store, project, action, path);
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
        `${teardownRan ? 'teardown ran, but ' : ''}${String(error)}; ${await partialState(profile, run, store, project, path)}`,
      );
    }
    return {
      action,
      paths: [path],
      branch: preview.branch,
      teardownRan,
      ...(forced ? { forced } : {}),
    };
  }
  if (action === 'recycle') {
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
      action,
      paths: [path],
      branch: preview.branch,
      base,
      ...(fetched ? {} : { fetchFailed: true }),
      ...(opts.deleteBranch && preview.branch && !branchKept ? { branchDeleted: true } : {}),
      ...(branchKept ? { branchKept } : {}),
    };
  }
  const destination = preview.destination as string;
  mkdirSync(join(profile.paths.root, 'recycle', project), { recursive: true });
  if (present(destination))
    throw new MesaError('usage', 'recycle destination appeared; preview again');
  try {
    await requireGit(run, root, ['worktree', 'move', '--', path, destination]);
  } catch (error) {
    throw new MesaError(
      'usage',
      `${String(error)}; ${await partialState(profile, run, store, project, path, destination)}`,
    );
  }
  return { action, paths: [path], destination, branch: preview.branch };
}

async function partialState(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
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
