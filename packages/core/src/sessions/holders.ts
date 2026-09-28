import { realpathSync } from 'node:fs';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

// Which session holds what only one session may: a worktree, an agent conversation, a resume.

/** The session a worktree is: the newest with it, as a resume keeps it. */
export const worktreeHolder = (store: SessionStore, path: string) =>
  store
    .list()
    .filter((r) => r.worktree?.path === path)
    .at(-1);

/** An unfinished session using a checkout, including a session in a folder below its root. */
export const checkoutHolders = (
  records: readonly SessionRecord[],
  project: string,
  root: string,
  path: string,
) =>
  records.filter((r) => {
    if (r.project !== project || r.endedAt) return false;
    const held = r.worktree?.path ?? r.cwd ?? root;
    let cwd: string;
    try {
      cwd = realpathSync.native(held);
    } catch {
      cwd = held;
    }
    return cwd === path || cwd.startsWith(`${path}/`);
  });

export const checkoutHolder = (store: SessionStore, project: string, root: string, path: string) =>
  checkoutHolders(store.list(), project, root, path).at(-1);

/**
 * Refuses `r`'s worktree once a newer session has it (a resume or a handoff took it over): two
 * sessions never share one. A session without a worktree passes.
 */
export function requireOwnWorktree(store: SessionStore, r: SessionRecord) {
  if (!r.worktree) return;
  const holder = worktreeHolder(store, r.worktree.path);
  if (holder && holder.id !== r.id) {
    throw new MesaError(
      'usage',
      `the worktree at ${r.worktree.path} is session ${holder.id}'s now: two sessions never share one`,
    );
  }
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
