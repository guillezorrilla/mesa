import { realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { MesaError } from '../../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

// Which session holds what only one session may: a worktree, an agent conversation, a resume.

/**
 * The worktrees a session holds, each with its project: its own, then each additional project's
 * (CONTEXT.md, Additional project). The one rule every holder check below reads.
 */
export const heldWorktrees = (
  r: Pick<SessionRecord, 'project' | 'worktree' | 'additional'>,
): { project: string; worktree: NonNullable<SessionRecord['worktree']> }[] => [
  ...(r.worktree ? [{ project: r.project, worktree: r.worktree }] : []),
  ...(r.additional ?? []),
];

/** The session each worktree path is among `records` (oldest first): the newest with it. */
export const worktreeHolders = (records: readonly SessionRecord[]) => {
  const holders = new Map<string, SessionRecord>();
  for (const r of records)
    for (const { worktree } of heldWorktrees(r)) holders.set(worktree.path, r);
  return holders;
};

/** The session a worktree is: the newest with it, as a resume keeps it. */
export const worktreeHolder = (store: SessionStore, path: string) =>
  worktreeHolders(store.list()).get(path);

/** A worktree of a session's that a newer session took over, which is `holder`'s now, branch and all. */
export type TakenOver = { project: string; worktree: string; holder: string };

/**
 * Each worktree `r` holds that a newer session took over since (a resume, a handoff, a later
 * review round), by `holders` (worktreeHolders).
 */
export const takenOver = (
  r: SessionRecord,
  holders: ReadonlyMap<string, SessionRecord>,
): TakenOver[] =>
  heldWorktrees(r).flatMap(({ project, worktree }) => {
    const newer = holders.get(worktree.path);
    return newer && newer.id !== r.id
      ? [{ project, worktree: worktree.path, holder: newer.id }]
      : [];
  });

/**
 * `path` as the file system resolves it; when it is gone (a stale worktree), its nearest folder
 * that is there resolved, with the rest as written.
 */
export const real = (path: string): string => {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(real(parent), basename(path));
  }
};

/** An unfinished session using a checkout, including a session in a folder below its root. */
export const checkoutHolders = (
  records: readonly SessionRecord[],
  project: string,
  root: string,
  path: string,
) =>
  records.filter((r) => {
    if (r.endedAt) return false;
    const folders = heldWorktrees(r)
      .filter((held) => held.project === project)
      .map((held) => held.worktree.path);
    if (r.project === project && !r.worktree) folders.push(r.cwd ?? root);
    return folders.map(real).some((cwd) => cwd === path || cwd.startsWith(`${path}/`));
  });

export const checkoutHolder = (store: SessionStore, project: string, root: string, path: string) =>
  checkoutHolders(store.list(), project, root, path).at(-1);

/**
 * Refuses `r`'s worktrees once a newer session has one (a resume or a handoff took it over): two
 * sessions never share one. A session without a worktree passes.
 */
export function requireOwnWorktree(store: SessionStore, r: SessionRecord) {
  const [taken] = takenOver(r, worktreeHolders(store.list()));
  if (taken)
    throw new MesaError(
      'usage',
      `the worktree at ${taken.worktree} is session ${taken.holder}'s now: two sessions never share one`,
    );
}

/** The newest eligible session that holds an agent session id (its conversation). */
export const agentSessionHolder = (
  store: SessionStore,
  agentSessionId: string,
  eligible: (record: SessionRecord) => boolean = () => true,
) =>
  store
    .list()
    .filter((r) => r.agentSessionId === agentSessionId && eligible(r))
    .at(-1);

/** The session `r` was resumed as: its record says so, or, when writing that failed, the record resuming it does. */
export const resumerOf = (store: SessionStore, r: SessionRecord) =>
  r.resumedBy ?? store.list().find((x) => x.resumedFrom === r.id)?.id;
