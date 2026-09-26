import type { Clock } from '../clock.js';
import { exitState, PROCESS } from '../decisions/session-state.js';
import { idOfWindow, type SessionRecord, type SessionStore, windowOf } from './store.js';
import { type TmuxBackend, VIEW_PREFIX } from './tmux.js';

/**
 * tmux's pane-died hook, through `mesa hook tmux pane-died <project> <window>`: the agent in a
 * Mesa window exited. Its state is known at once, `done` for exit status 0 and `failed` for
 * another status or a signal, as a look reads a dead pane (session-state.ts), with an `exited`
 * event. It is not stopped: `endedAt` is left to stop and resume, so the board still ranks it,
 * shows its last screen, and offers Resume (the owner's call, ADR-0003 amendment).
 *
 * `project` is the tmux session tmux names, the project's or a terminal's view of it. A window
 * that is no session of this profile's, or a session already stopped, or whose exit is already
 * recorded, is left alone: undefined. A look that saw the dead pane first does not count: the
 * hook still records the exit.
 * ponytail: the update waits for the record's lock like any other, up to 2 s, over the hook's
 * 200 ms budget; tmux runs the hook in the background (run-shell -b), so only this pane waits.
 */
export async function recordPaneDied(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'findWindow'>; clock: Clock },
  project: string,
  window: string,
): Promise<SessionRecord | undefined> {
  const id = idOfWindow(window);
  const found = id ? deps.store.find(id) : undefined;
  const ours = found?.tmux.window === window;
  const shown = project === found?.tmux.session || project.startsWith(VIEW_PREFIX);
  const recorded = (r: SessionRecord) =>
    Boolean(r.endedAt) || r.events.some((e) => e.type === 'exited');
  if (!found || !ours || !shown || recorded(found)) return undefined;
  // The project's own session: a view's name lists no windows of its own.
  const pane = await deps.tmux.findWindow(windowOf(found));
  const at = deps.clock().toISOString();
  const lastState = {
    state: pane?.dead ? exitState(pane) : 'done',
    confidence: PROCESS,
    at,
    source: 'tmux-hook',
  } as const;
  let wrote = false;
  const record = deps.store.update(found.id, (current) => {
    if (recorded(current)) return {};
    wrote = true;
    return { lastState, events: [...current.events, { type: 'exited', at }] };
  });
  return wrote ? record : undefined;
}
