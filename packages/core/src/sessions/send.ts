import type { Clock } from '../clock.js';
import { guardrail } from '../decisions/guardrail.js';
import type { Env } from '../process.js';
import { MesaError } from '../result.js';
import {
  recordIf,
  type SessionRecord,
  type SessionStore,
  sessionEnded,
  windowOf,
  windowSession,
} from './store.js';
import { isShell, type TmuxBackend } from './tmux.js';

export type Sent = {
  sent: true;
  session: string;
  project: string;
  /** The session that sent it, or null. */
  from: string | null;
  chars: number;
};

/** States in which the agent waits on a person, who answers inside the session (ADR-0003). */
const WAITING = new Set(['waiting-permission', 'waiting-question']);

/** A prompt's length in characters (code points), as `chars` and receipts count it. */
export const charCount = (text: string) => Array.from(text).length;

/** The line a prompt from another session starts with: who sent it, and how to answer. */
const header = (sender: SessionRecord) =>
  `[mesa] from session ${sender.id} (${sender.project}). Reply with: mesa send ${sender.id} "<reply>"`;

/**
 * The session a prompt is from: `from` when given (not_found if it is not a session here), else
 * the session whose window this runs in (windowSession), else none. Never the receiver itself.
 */
function senderOf(
  deps: { store: SessionStore; env: Env; profileName: string },
  to: string,
  from: string | undefined,
): SessionRecord | undefined {
  const sender = from === undefined ? windowSession(deps) : recordIf(deps.store, from);
  if (from !== undefined && !sender) {
    throw new MesaError('not_found', `no session ${from} to send from; see mesa sessions`);
  }
  if (sender?.id === to) throw new MesaError('usage', `session ${to} cannot send to itself`);
  return sender;
}

/**
 * Types `prompt` into a live session's agent as one literal chunk, then one Enter (ADR-0001), and
 * adds a `send` event to its record. From another session (`from`, else the window this runs
 * in), a header line first names the sender and how to reply, and the sender's record gets a
 * `sent` event. A session that exited is not_found; a pane running a shell, or an agent waiting
 * on a person, is a usage error; `force` sends anyway.
 */
export async function sendPrompt(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'findWindow' | 'sendText'>;
    clock: Clock;
    env: Env;
    profileName: string;
  },
  id: string,
  prompt: string,
  { force = false, from }: { force?: boolean; from?: string } = {},
): Promise<Sent> {
  if (!prompt.trim()) throw new MesaError('usage', 'nothing to send: the prompt is empty');
  const record = deps.store.get(id);
  const sender = senderOf(deps, id, from);
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
    const text = sender ? `${header(sender)}\n${prompt}` : prompt;
    await deps.tmux.sendText(target, text, { force: true });
  } catch (error) {
    if (error instanceof MesaError && error.code === 'agent_unavailable') throw sessionEnded();
    throw error;
  }
  const chars = charCount(prompt);
  const at = deps.clock().toISOString();
  // Re-read, so an event added while the keys were typed is kept.
  const log = (to: string, event: SessionRecord['events'][number]) =>
    deps.store.update(to, { events: [...deps.store.get(to).events, event] });
  log(id, { type: 'send', at, chars, ...(sender ? { from: sender.id } : {}) });
  if (sender) log(sender.id, { type: 'sent', at, chars, to: id });
  return { sent: true, session: id, project: record.project, from: sender?.id ?? null, chars };
}
