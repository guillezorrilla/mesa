import type { SessionStore } from './store.js';
import { type TmuxBackend, targetLabel } from './tmux/backend.js';
import { windowOf } from './window-name.js';

/** Sizes a session's window to a view (the app's terminal) now; tmux then follows its latest client. */
export async function resizeSession(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'resizeWindow'> },
  id: string,
  cols: number,
  rows: number,
) {
  const target = windowOf(deps.store.get(id));
  await deps.tmux.resizeWindow(target, cols, rows);
  return { session: id, target: targetLabel(target), cols, rows };
}
