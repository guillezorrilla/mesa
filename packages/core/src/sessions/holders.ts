import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

// Which session holds what only one session may: a worktree, an agent conversation, a resume.

/** The session a worktree is: the newest with it, as a resume keeps it. */
export const worktreeHolder = (store: SessionStore, path: string) =>
  store
    .list()
    .filter((r) => r.worktree?.path === path)
    .at(-1);

/** The newest session that holds an agent session id (its conversation). */
export const agentSessionHolder = (store: SessionStore, agentSessionId: string) =>
  store
    .list()
    .filter((r) => r.agentSessionId === agentSessionId)
    .at(-1);

/** The session `r` was resumed as: its record says so, or, when writing that failed, the record resuming it does. */
export const resumerOf = (store: SessionStore, r: SessionRecord) =>
  r.resumedBy ?? store.list().find((x) => x.resumedFrom === r.id)?.id;
