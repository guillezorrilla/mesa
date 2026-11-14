import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { outputSince } from './output-log.js';
import { resizeSession } from './resize.js';
import { windowOf } from './window-name.js';

/**
 * Session `id`'s window as the phone's terminal draws it, in orca's phone mode: held at the
 * phone's `cols` and `rows` (resizeSession), which the Mac's attached views would otherwise undo
 * at once, until the app's Take back, then
 * its pane's history and screen with their colours (`text`), and `at`, where its output log ends,
 * from which the stream of what it prints next goes on (outputSince).
 */
export async function sessionScreen(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'resizeWindow' | 'holdWindow' | 'captureScreen'>;
    logs: string;
  },
  id: string,
  cols: number,
  rows: number,
) {
  await resizeSession(deps, id, cols, rows, true);
  const { to: at } = outputSince(deps.logs, id);
  const text = await deps.tmux.captureScreen(windowOf(deps.store.get(id)));
  return { text, at };
}
