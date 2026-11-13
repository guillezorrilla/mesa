import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { outputSince } from './output-log.js';
import { resizeSession } from './resize.js';
import { windowOf } from './window-name.js';

/**
 * Session `id`'s window as the phone's terminal draws it, in orca's phone mode: sized to the
 * phone's `cols` and `rows` (resizeSession, so the Mac's own view takes it back once used), then
 * its pane's history and screen with their colours (`text`), and `at`, where its output log ends,
 * from which the stream of what it prints next goes on (outputSince).
 */
export async function sessionScreen(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'resizeWindow' | 'captureScreen'>;
    logs: string;
  },
  id: string,
  cols: number,
  rows: number,
) {
  await resizeSession(deps, id, cols, rows);
  const { to: at } = outputSince(deps.logs, id);
  const text = await deps.tmux.captureScreen(windowOf(deps.store.get(id)));
  return { text, at };
}
