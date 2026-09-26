import { readyAgent } from '../agents/agents.js';
import { MesaError } from '../lib/result.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import type { RegistryEntry } from '../projects/registry.js';
import { folderOf, launched, openWindowOf } from './launch.js';
import { type OpenDeps, syncSkillsInto, worktreeFor } from './open.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import type { TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';
import { removeWorktree, type Worktree } from './worktree.js';

// Queued sessions (CONTEXT.md, Queued session): `mesa open --after` writes one; whichever signal
// first finds the session it waits on over starts it (the SessionEnd hook, the pane-died hook, or
// a look at the board). No daemon.

// ponytail: a start killed mid-way (a SessionEnd hook gets 1.5 s) is retried by the next signal or
// look once its claim is this old; a start still running after that could open a second window.
const CLAIM_MS = 30_000;

/** Queued, and nobody is starting it now: never claimed, or its claim is stale. */
const startable = (r: SessionRecord, now: Date) =>
  r.lastState.state === 'queued' &&
  r.pending !== undefined &&
  (r.pending.claimedAt === undefined ||
    now.getTime() - Date.parse(r.pending.claimedAt) >= CLAIM_MS);

/** The queued sessions to start now: those waiting on a session `over` says is over. */
export const dueToStart = (store: SessionStore, over: (id: string) => boolean, now: Date) =>
  store.list().filter((r) => r.after !== undefined && startable(r, now) && over(r.after));

/**
 * Starts a queued session the way `mesa open` starts one (its agent checked, its worktree, its
 * skills, its window), exactly once: the claim is taken under the record's lock, so of two
 * signals at once, one starts it and the other gets undefined. A start that fails leaves the
 * session `failed` and ended, its new worktree removed, and throws.
 */
export async function startQueued(
  deps: OpenDeps & { tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow'> },
  id: string,
): Promise<{ record: SessionRecord; warning?: string } | undefined> {
  const now = deps.clock();
  const at = now.toISOString();
  let won = false;
  // The agent session id comes with the claim, so a start retried after a kill keeps it.
  const claimed = deps.store.update(id, (current) => {
    if (!startable(current, now)) return {};
    won = true;
    const agentSessionId = current.agentSessionId ?? deps.newUuid();
    return { pending: { ...current.pending, claimedAt: at }, agentSessionId };
  });
  if (!won) return undefined;
  let entry: RegistryEntry | undefined;
  let made: Worktree | undefined;
  try {
    entry = findProject(deps.profile, claimed.project);
    // A folder that is gone is not_found, never a claude in $HOME.
    readProjectFile(entry.path);
    const spec = await readyAgent(deps.run, claimed.agent);
    const agentSessionId = claimed.agentSessionId ?? deps.newUuid();
    const { branch, base } = claimed.pending ?? {};
    let record = claimed;
    // Kept on the record at once, so a start retried after a kill finds it made.
    if (!record.worktree && branch !== undefined) {
      made = await worktreeFor(deps, entry, branch, base);
      record = deps.store.update(id, { worktree: made });
    }
    const warning = syncSkillsInto(deps, entry.name, folderOf(record, entry));
    // A start killed after its window opened left that window: it is this session's.
    if (!(await deps.tmux.findWindow(windowOf(record)))) {
      await openWindowOf(deps, record, entry, spec.start(agentSessionId, record.goal));
    }
    const started = deps.store.update(id, {
      pending: undefined,
      startedAt: at,
      lastState: launched(at),
    });
    return { record: started, ...(warning ? { warning } : {}) };
  } catch (error) {
    if (entry && made) await removeWorktree(deps.run, entry.path, made);
    deps.store.update(id, {
      pending: undefined,
      agentSessionId: undefined,
      ...(made ? { worktree: undefined } : {}),
      endedAt: at,
      lastState: { state: 'failed', confidence: 1, at, source: 'mesa' },
    });
    throw error;
  }
}

/**
 * Cancels a queued session (mesa stop): `stopped`, and ended, so it never starts. The sessions
 * queued after it wait on what it waited on instead, so a chain keeps its order. A usage error
 * while a signal is starting it.
 */
export function cancelQueued(store: SessionStore, id: string, now: Date): SessionRecord {
  const at = now.toISOString();
  const cancelled = store.update(id, (current) => {
    if (!startable(current, now)) {
      throw new MesaError('usage', `session ${id} is starting; stop it once it runs`);
    }
    return {
      pending: undefined,
      agentSessionId: undefined,
      endedAt: at,
      lastState: { state: 'stopped', confidence: 1, at, source: 'mesa' },
    };
  });
  const waitsOnIt = (r: SessionRecord) => r.after === id && r.lastState.state === 'queued';
  for (const next of store.list().filter(waitsOnIt)) {
    store.update(next.id, (current) => (waitsOnIt(current) ? { after: cancelled.after } : {}));
  }
  return cancelled;
}
