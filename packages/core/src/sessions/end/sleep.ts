import type { SessionRecord } from '../record/record.js';
import { quitAgent, type StopDeps } from './stop.js';

// Sleeping sessions (CONTEXT.md, Sleeping session; #897): a finished session nobody is looking at
// has its agent quit after a set idle time, freeing its process, and keeps its record, so `mesa
// wake` reopens the same conversation in the same session.

/** What the look saw of a session when it asks whether it may sleep. */
export type SleepSeen = {
  now: Date;
  /** `sessions.sleepAfterMinutes` in ms; 0 is off. */
  afterMs: number;
  /** The session the app shows in a focused window, which never sleeps. */
  shown?: string;
  /** Whether its window runs its agent now. */
  alive: boolean;
  /** Its child sessions' records. */
  children: readonly SessionRecord[];
};

/** Why `r` may not sleep now, or undefined when it may. */
export function sleepBlocker(r: SessionRecord, seen: SleepSeen): string | undefined {
  if (seen.afterMs <= 0) return 'sleep is off';
  if (r.kind !== 'interactive' || (r.agent !== 'claude' && r.agent !== 'codex'))
    return 'not an interactive Claude Code or Codex session';
  if (r.background) return 'a background session';
  if (r.endedAt || r.sleeping) return 'not running';
  if (!seen.alive) return 'its agent is not running';
  if (r.lastState.state !== 'idle' && r.lastState.state !== 'done') return 'not finished';
  if (r.unread) return 'unread';
  if (seen.shown === r.id) return 'shown';
  if (seen.children.some((c) => !c.endedAt && !c.sleeping)) return 'a child is running';
  const idle = seen.now.getTime() - Date.parse(r.lastState.at);
  if (!(idle >= seen.afterMs)) return 'not idle long enough';
  return undefined;
}

/**
 * Puts session `id` to sleep: marked `sleeping` first, under its lock and only while `still`
 * holds for the record as it is then, so the quit's SessionEnd and pane-died signals leave it
 * running; then its agent quits and its window closes (quitAgent). An agent that does not quit is
 * killed, as a stop kills it.
 */
export async function sleepSession(
  deps: StopDeps,
  id: string,
  still: (current: SessionRecord) => boolean,
): Promise<SessionRecord | undefined> {
  const at = deps.clock().toISOString();
  let marked = false;
  const record = deps.store.update(id, (current) => {
    if (!still(current)) return {};
    marked = true;
    return { sleeping: { at } };
  });
  if (!marked) return undefined;
  try {
    await quitAgent(deps, record);
  } catch (error) {
    // Its agent may still run: it is awake again, so nothing waits on a wake that never comes.
    deps.store.update(id, (current) =>
      current.sleeping?.at === at ? { sleeping: undefined } : {},
    );
    throw error;
  }
  return record;
}
