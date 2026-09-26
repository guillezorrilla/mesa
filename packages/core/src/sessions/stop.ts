import { AGENTS } from '../agents/agents.js';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import { cancelQueued } from './queue.js';
import { ending, type SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import type { WindowTarget } from './tmux/format.js';
import { windowOf } from './window-name.js';

const POLITE_WAIT_MS = 5000;
const POLL_MS = 250;
/** Lets a lone Escape land before more keys, which a TUI could read as Alt+/ and so on. */
const ESCAPE_SETTLE_MS = 300;

/**
 * How a stop went: the agent quit when asked (or had exited), was killed (forced, or still running
 * after the wait), its window was already gone, the session was queued and never starts now, or
 * it had already been stopped.
 */
export type StopOutcome = 'exited' | 'killed' | 'gone' | 'cancelled' | 'already-ended';

type StopDeps = {
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'findWindow' | 'pressKey' | 'sendText' | 'killWindow'>;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
};

/**
 * Ends a session: Escape, the agent's quit command, up to 5 s for its pane to die or its window
 * to vanish, then `kill-window`; `force` skips the polite step. The record gets `endedAt` and
 * `done` (a `failed` stays failed). A queued session is cancelled. A session already stopped
 * changes nothing.
 */
export async function stopSession(
  deps: StopDeps,
  id: string,
  { force = false } = {},
): Promise<{ record: SessionRecord; outcome: StopOutcome }> {
  const found = deps.store.get(id);
  if (found.endedAt) return { record: found, outcome: 'already-ended' };
  if (found.lastState.state === 'queued') {
    return { record: cancelQueued(deps.store, id, deps.clock()), outcome: 'cancelled' };
  }
  const target = windowOf(found);
  const pane = () => deps.tmux.findWindow(target);

  let outcome: StopOutcome = 'gone';
  const first = await pane();
  if (first) {
    const spec = AGENTS[found.agent];
    if (!force && !first.dead && 'quit' in spec) await askToQuit(deps, target, spec.quit, pane);
    const last = await pane();
    outcome = !last || last.dead ? 'exited' : 'killed';
    // A pane that exited stays, dead, under remain-on-exit; the window goes either way.
    if (last) await killIfThere(deps.tmux, target);
  }
  const at = deps.clock().toISOString();
  const record = deps.store.update(id, (current) => ending(current, at));
  return { record, outcome };
}

/** Escape, then the quit command, then up to POLITE_WAIT_MS for the pane to die or vanish. */
async function askToQuit(
  deps: StopDeps,
  target: WindowTarget,
  quit: string,
  pane: () => Promise<{ dead: boolean } | undefined>,
) {
  try {
    // Escape first: it dismisses a pending permission prompt (a denial) that the Enter after the
    // quit command would otherwise answer.
    await deps.tmux.pressKey(target, 'Escape');
    await deps.sleep(ESCAPE_SETTLE_MS);
    await deps.tmux.sendText(target, quit);
  } catch (error) {
    // No agent to ask (the pane runs a shell): the caller kills the window.
    if (error instanceof MesaError && error.code === 'agent_unavailable') return;
    throw error;
  }
  for (let waited = 0; waited < POLITE_WAIT_MS; waited += POLL_MS) {
    const now = await pane();
    if (!now || now.dead) return;
    await deps.sleep(POLL_MS);
  }
}
