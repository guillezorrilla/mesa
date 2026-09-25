import type { Clock } from '../clock.js';
import { type SessionRecord, type SessionStore, windowOf } from './store.js';
import type { TmuxBackend, WindowTarget } from './tmux.js';

/**
 * One board row: the record, whether its tmux window exists (a pane whose agent exited still
 * does), and how long it has run.
 */
export type SessionRow = SessionRecord & { alive: boolean; runningSeconds: number };

/** States a session does not leave on its own; distinct from ended (stopped, with `endedAt`). */
const FINAL_STATES = new Set(['done', 'failed']);

/**
 * The profile's sessions merged with live tmux. A session that has not ended but whose window is
 * gone is marked `done` from tmux, and that is saved.
 */
export async function listSessions(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'listWindows'>; clock: Clock },
  { all = false } = {},
): Promise<SessionRow[]> {
  const records = deps.store.list({ all });
  if (!records.length) return [];
  // One tmux call for the whole board rather than one windowExists per record.
  const key = (t: WindowTarget) => `${t.project}:${t.window}`;
  const windows = new Set((await deps.tmux.listWindows()).map(key));
  const now = deps.clock();
  return records.map((found) => {
    const alive = windows.has(key(windowOf(found)));
    const gone = !alive && !found.endedAt && !FINAL_STATES.has(found.lastState.state);
    const record = gone
      ? deps.store.update(found.id, {
          // ponytail: #18's rule, set here; Faro's rules backend (#25) takes state over. 0.85 as for
          // pane_dead (ADR-0003 amendment): the window being gone is a process fact.
          lastState: { state: 'done', confidence: 0.85, at: now.toISOString(), source: 'tmux' },
        })
      : found;
    // An ended session stops the clock when it ended, or when it was seen to.
    const end =
      record.endedAt ??
      (FINAL_STATES.has(record.lastState.state) ? record.lastState.at : undefined);
    const until = end ? Date.parse(end) : now.getTime();
    const runningSeconds = Math.max(0, Math.round((until - Date.parse(record.startedAt)) / 1000));
    return { ...record, alive, runningSeconds };
  });
}
