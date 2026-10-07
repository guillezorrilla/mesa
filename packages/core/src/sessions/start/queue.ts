import { newSessionId, startCommand } from '../../agents/agents.js';
import { readyAgent } from '../../doctor/probe.js';
import type { IdSource } from '../../lib/ids.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { windowOf } from '../window/window-name.js';
import { additionalDirs, additionalProjects } from './additional.js';
import { type LaunchDeps, launchProject, startSession } from './launch.js';
import { launched } from './new-record.js';

// Queued sessions (CONTEXT.md, Queued session): `mesa open --after` writes one; whichever signal
// first finds the session it waits on over starts it (the SessionEnd hook, the pane-died hook,
// its stop, or a look at the board: end-signals.ts). No daemon.

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
 * signals at once, one starts it and the other gets undefined. Its `pending.with` projects each get
 * a worktree on its branch too (additional.ts). A start that fails leaves the session `failed` and
 * ended, every new worktree removed (startSession), and throws.
 */
export async function startQueued(
  deps: LaunchDeps & { newUuid: IdSource; tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow'> },
  id: string,
  expectedAfter?: string,
): Promise<{ record: SessionRecord; warning?: string } | undefined> {
  const now = deps.clock();
  const at = now.toISOString();
  // The agent session id Mesa picks comes with the claim, so a start retried after a kill keeps
  // it; an agent that picks its own gets none.
  let claimedHere = false;
  const claimed = deps.store.withDependencyLock(() =>
    deps.store.update(id, (current) => {
      if (!startable(current, now) || (expectedAfter && current.after !== expectedAfter)) return {};
      if (current.agent === 'terminal')
        throw new MesaError('usage', 'plain terminal sessions cannot be queued');
      claimedHere = true;
      const agentSessionId = current.background
        ? undefined
        : (current.agentSessionId ?? newSessionId(current.agent, deps.newUuid));
      return { pending: { ...current.pending, claimedAt: at }, agentSessionId };
    }),
  );
  if (!claimedHere) return undefined;
  if (claimed.agent === 'terminal')
    throw new MesaError('usage', 'plain terminal sessions cannot be queued');
  const agent = claimed.agent;
  try {
    const { entry } = launchProject(deps.profile, claimed.project);
    await readyAgent(deps.run, claimed.agent);
    const { branch, base, with: extra } = claimed.pending ?? {};
    // Checked again: a project may have gone, or its setup changed, since it was queued.
    const additional = extra && entry ? await additionalProjects(deps, entry, extra) : undefined;
    // A start killed after its window opened left that window, its worktree and skills already
    // made: it is this session's.
    const { warning } = (await deps.tmux.findWindow(windowOf(claimed)))
      ? {}
      : await startSession(deps, claimed, entry, {
          command: (r) =>
            startCommand(
              agent,
              deps.mounts,
              deps.profile.config.agents,
              { ...r, logs: deps.profile.paths.logs },
              additionalDirs(r),
            ),
          branch,
          base,
          ...(additional ? { additional: additional.map((e) => ({ entry: e, base })) } : {}),
        });
    const started = deps.store.update(id, {
      pending: undefined,
      startedAt: at,
      lastState: launched(at),
    });
    return { record: started, ...(warning ? { warning } : {}) };
  } catch (error) {
    deps.store.update(id, {
      pending: undefined,
      agentSessionId: undefined,
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
  return store.withDependencyLock(() => {
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
  });
}
