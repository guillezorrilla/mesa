import type { Clock } from '../clock.js';
import { guardrail } from '../decisions/guardrail.js';
import type { Env } from '../process.js';
import { MesaError } from '../result.js';
import {
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
 * The session a prompt is from: `from` when given (not_found if it is not a session here, usage
 * if it has ended: a reply would go nowhere), none with `noFrom`, else the session whose window
 * this runs in (windowSession). Never the receiver itself.
 */
function senderOf(
  deps: { store: SessionStore; env: Env; profileName: string },
  to: string,
  { from, noFrom }: { from?: string; noFrom?: boolean },
): SessionRecord | undefined {
  if (noFrom && from !== undefined)
    throw new MesaError('usage', 'pass --from or --no-from, not both');
  if (from === '') throw new MesaError('usage', '--from needs a session id');
  let sender: SessionRecord | undefined;
  if (from !== undefined) {
    sender = deps.store.find(from);
    if (!sender)
      throw new MesaError('not_found', `no session ${from} to send from; see mesa sessions`);
    if (sender.endedAt) {
      throw new MesaError('usage', `session ${from} has ended, so a reply to it would go nowhere`);
    }
  } else if (!noFrom) {
    sender = windowSession(deps);
  }
  if (sender?.id === to) throw new MesaError('usage', `session ${to} cannot send to itself`);
  return sender;
}

/**
 * Types `prompt` into a live session's agent as one literal chunk, then one Enter (ADR-0001), and
 * adds a `send` event to its record. From another session (`from`, else the window this runs
 * in, unless `noFrom`), a header line first names the sender and how to reply, and the sender's
 * record gets a `sent` event. A session that exited is not_found; a pane running a shell, or an
 * agent waiting on a person, is a usage error; `force` sends anyway, except from another session
 * into a wait, which only a person answers (ADR-0003).
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
  { force = false, from, noFrom }: { force?: boolean; from?: string; noFrom?: boolean } = {},
): Promise<Sent> {
  if (!prompt.trim()) throw new MesaError('usage', 'nothing to send: the prompt is empty');
  const record = deps.store.get(id);
  const sender = senderOf(deps, id, { from, noFrom });
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (!pane || pane.dead) throw sessionEnded();
  if (!force && isShell(pane.command)) {
    throw new MesaError(
      'usage',
      `session ${id} runs ${pane.command}, not its agent; --force sends anyway`,
    );
  }
  // The Enter after the text would answer a permission prompt, which Mesa never relays; another
  // session may not force it, since only a person answers one (ADR-0003).
  if (WAITING.has(record.lastState.state) && (sender || !force)) {
    const state = record.lastState.state;
    throw new MesaError(
      'usage',
      sender
        ? `session ${id} is ${state}; a person answers it there (mesa attach ${id})`
        : `session ${id} is ${state}; answer it there (mesa attach ${id}), or --force`,
    );
  }

  // Guardrail hook point: see decisions/guardrail.ts.
  await guardrail({
    session: id,
    project: record.project,
    text: prompt,
    ...(sender ? { from: sender.id } : {}),
  });

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
  // Under the record's lock, onto the record as it is now, so a concurrent event is kept.
  const addEvent = (recordId: string, event: SessionRecord['events'][number]) =>
    deps.store.update(recordId, (current) => ({ events: [...current.events, event] }));
  // The receiver first, so there is never a `sent` without its `send`.
  addEvent(id, { type: 'send', at, chars, ...(sender ? { from: sender.id } : {}) });
  // A sender removed while its prompt was typed loses only its own log line; the send happened.
  if (sender && deps.store.find(sender.id))
    addEvent(sender.id, { type: 'sent', at, chars, to: id });
  return { sent: true, session: id, project: record.project, from: sender?.id ?? null, chars };
}
