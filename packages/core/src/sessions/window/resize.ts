import { MesaError } from '../../lib/result.js';
import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { targetLabel } from '../tmux/format.js';
import { windowOf } from './window-name.js';

// ponytail: 10000 cells a side, far past any screen; tmux itself caps a window near there.
const MAX_CELLS = 10_000;

/**
 * Sizes a session's window to a view now: the app's terminal, after which tmux follows its latest
 * client (which takes back a phone's hold), or a phone's (`hold`), held there until then.
 * `cols` and `rows` are whole numbers from 1 to 10000, else usage.
 */
export async function resizeSession(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'resizeWindow' | 'holdWindow'> },
  id: string,
  cols: number,
  rows: number,
  hold = false,
) {
  for (const [name, n] of [
    ['cols', cols],
    ['rows', rows],
  ] as const) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_CELLS) {
      throw new MesaError('usage', `${name} must be a whole number from 1 to ${MAX_CELLS}`);
    }
  }
  const target = windowOf(deps.store.get(id));
  await (hold ? deps.tmux.holdWindow : deps.tmux.resizeWindow)(target, cols, rows);
  return { session: id, target: targetLabel(target), cols, rows };
}
