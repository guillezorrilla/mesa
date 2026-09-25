import type { Clock } from '../clock.js';
import { guardrail } from '../decisions/guardrail.js';
import { MesaError } from '../result.js';
import { type SessionStore, sessionEnded, windowOf } from './store.js';
import { isShell, type TmuxBackend } from './tmux.js';

export type Sent = { sent: true; session: string; project: string; chars: number };

/** States in which the agent waits on a person, who answers inside the session (ADR-0003). */
const WAITING = new Set(['waiting-permission', 'waiting-question']);

/** A prompt's length in characters (code points), as `chars` and receipts count it. */
export const charCount = (text: string) => Array.from(text).length;

/**
 * Types `prompt` into a live session's agent as one literal chunk, then one Enter (ADR-0001), and
 * adds a `send` event to its record. A session that exited is not_found; a pane running a shell,
 * or an agent waiting on a person, is a usage error; `force` sends anyway.
 */
export async function sendPrompt(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'findWindow' | 'sendText'>;
    clock: Clock;
  },
  id: string,
  prompt: string,
  { force = false } = {},
): Promise<Sent> {
  if (!prompt.trim()) throw new MesaError('usage', 'nothing to send: the prompt is empty');
  const record = deps.store.get(id);
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (!pane || pane.dead) throw sessionEnded();
  if (!force && isShell(pane.command)) {
    throw new MesaError(
      'usage',
      `session ${id} runs ${pane.command}, not its agent; --force sends anyway`,
    );
  }
  // The Enter after the text would answer a permission prompt, which Mesa never relays.
  if (!force && WAITING.has(record.lastState.state)) {
    throw new MesaError(
      'usage',
      `session ${id} is ${record.lastState.state}; answer it there (mesa attach ${id}), or --force`,
    );
  }

  // Guardrail hook point: see decisions/guardrail.ts.
  await guardrail({ session: id, project: record.project, text: prompt });

  try {
    // The checks above are done; sendText still refuses a pane that died since.
    await deps.tmux.sendText(target, prompt, { force: true });
  } catch (error) {
    if (error instanceof MesaError && error.code === 'agent_unavailable') throw sessionEnded();
    throw error;
  }
  const chars = charCount(prompt);
  const event = { type: 'send', at: deps.clock().toISOString(), chars };
  // Re-read, so an event added while the keys were typed is kept.
  deps.store.update(id, { events: [...deps.store.get(id).events, event] });
  return { sent: true, session: id, project: record.project, chars };
}
