import { AGENTS } from '../agents/agents.js';
import type { Guarded, Override } from '../decisions/guardrail.js';
import type { Clock } from '../lib/clock.js';
import { MesaError, toFail } from '../lib/result.js';
import type { Caller } from './caller.js';
import { refuseRun, type SessionRecord, sessionEnded } from './record.js';
import { WAITING_STATES } from './states.js';
import type { SessionStore } from './store.js';
import type { TmuxBackend } from './tmux/backend.js';
import { isShell } from './tmux/format.js';
import { windowOf } from './window-name.js';

export type Sent = {
  sent: true;
  session: string;
  project: string;
  /** The session that sent it, or null. */
  from: string | null;
  chars: number;
  /** What let it past the guardrail: --yes or a person's yes on an ask, --force. */
  override?: Override;
  /** Sent, but an event could not be written. */
  warning?: string;
};

/** A prompt's length in characters (code points), as `chars` and receipts count it. */
const charCount = (text: string) => Array.from(text).length;

/** The line a prompt from another session starts with: who sent it, and how to answer. */
const header = (sender: SessionRecord) =>
  `[mesa] from session ${sender.id} (${sender.project}). Reply with: mesa send ${sender.id} "<reply>"`;

/**
 * Who a prompt is from. `window` is the Mesa session whose window this runs in (the caller),
 * whatever the flags say: an agent there may not force a wait. `sender` is the one the header
 * names: `from` when given (not_found if it is not a session here, usage if it has ended, since
 * a reply would go nowhere), none with `noFrom`, else the window's session while it is live.
 * Never the receiver itself.
 */
function senderOf(
  deps: { store: SessionStore; caller: () => Caller },
  to: string,
  { from, noFrom }: { from?: string; noFrom?: boolean },
): { sender?: SessionRecord; window?: SessionRecord } {
  if (noFrom && from !== undefined) {
    throw new MesaError('usage', 'pass --from or --no-from, not both');
  }
  if (from === '') throw new MesaError('usage', '--from needs a session id');
  const window = deps.caller().session;
  let sender: SessionRecord | undefined;
  if (from !== undefined) {
    sender = deps.store.find(from);
    if (!sender) {
      throw new MesaError('not_found', `no session ${from} to send from; see mesa sessions`);
    }
    if (sender.endedAt) {
      throw new MesaError('usage', `session ${from} has ended, so a reply to it would go nowhere`);
    }
  } else if (!noFrom && !window?.endedAt) {
    sender = window;
  }
  if (sender?.id === to) throw new MesaError('usage', `session ${to} cannot send to itself`);
  return { sender, window };
}

/**
 * Types `prompt` into a live session's agent as one literal chunk, then one Enter (ADR-0001), and
 * adds a `send` event to its record. From another session (`from`, else the window this runs
 * in, unless `noFrom`), a header line first names the sender and how to reply, and the sender's
 * record gets a `sent` event. A session that exited is not_found; a skill run, a pane running a
 * shell, or an agent waiting on a person, is a usage error; `force` sends anyway, except from
 * another session into a wait, which only a person answers (ADR-0003). Once those pass, `guard`
 * (the guardrail, with the caller's overrides) has the last word before anything is typed.
 */
export async function sendPrompt(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'findWindow' | 'sendText'>;
    clock: Clock;
    caller: () => Caller;
    /** The guardrail: throws guardrail_blocked, or returns the override that let it through. */
    guard: (action: Guarded) => Promise<Override | undefined>;
  },
  id: string,
  prompt: string,
  { force = false, from, noFrom }: { force?: boolean; from?: string; noFrom?: boolean } = {},
): Promise<Sent> {
  if (!prompt.trim()) throw new MesaError('usage', 'nothing to send: the prompt is empty');
  const record = deps.store.get(id);
  if (record.agent === 'terminal')
    throw new MesaError('usage', `session ${id} is a plain terminal; type into it directly`);
  refuseRun(record, 'takes no prompt');
  const { sender, window } = senderOf(deps, id, { from, noFrom });
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (!pane || pane.dead) throw sessionEnded();
  if (!force && isShell(pane.command)) {
    throw new MesaError(
      'usage',
      `session ${id} runs ${pane.command}, not its agent; --force sends anyway`,
    );
  }
  // The Enter after the text would answer a permission prompt, which Mesa never relays. Another
  // session may not force it, with --no-from or without: only a person answers one (ADR-0003).
  // Any Mesa window counts, this profile's or another's.
  const agent = Boolean(sender ?? window) || deps.caller().inMesaWindow;
  if (WAITING_STATES.has(record.lastState.state) && (agent || !force)) {
    const state = record.lastState.state;
    throw new MesaError(
      'usage',
      agent
        ? `session ${id} is ${state}; a person answers it there (mesa attach ${id})`
        : `session ${id} is ${state}; answer it there (mesa attach ${id}), or --force`,
    );
  }

  // Last, so a person is never asked about a send that would be refused anyway.
  const override = await deps.guard({
    action: 'send',
    target: id,
    text: prompt,
    project: record.project,
  });

  try {
    // The checks above are done; sendText still refuses a pane that died since.
    const text = sender ? `${header(sender)}\n${prompt}` : prompt;
    const { submitDelayMs } = AGENTS[record.agent];
    await deps.tmux.sendText(target, text, { force: true, submitDelayMs });
  } catch (error) {
    if (error instanceof MesaError && error.code === 'agent_unavailable') throw sessionEnded();
    throw error;
  }
  const chars = charCount(prompt);
  const at = deps.clock().toISOString();
  // The prompt is typed now, so its events are best effort: one that cannot be written (a record
  // locked by a killed mesa, or removed meanwhile) becomes a warning, never a failed send that a
  // retry would type twice. Each goes under the record's lock, onto the record as it is now.
  const problems: string[] = [];
  const addEvent = (recordId: string, event: SessionRecord['events'][number]) => {
    try {
      deps.store.update(recordId, (current) => ({ events: [...current.events, event] }));
      return true;
    } catch (error) {
      const why =
        error instanceof MesaError && error.code === 'locked'
          ? 'its record is locked by another mesa process'
          : toFail(error).error.message;
      problems.push(`no ${event.type} event on ${recordId} (${why})`);
      return false;
    }
  };
  // The receiver first, and the sender only after it, so there is never a `sent` without its `send`.
  const received = addEvent(id, {
    type: 'send',
    at,
    chars,
    ...(sender ? { from: sender.id } : {}),
  });
  if (sender && received) addEvent(sender.id, { type: 'sent', at, chars, to: id });
  else if (sender) problems.push(`no sent event on ${sender.id}`);
  return {
    sent: true,
    session: id,
    project: record.project,
    from: sender?.id ?? null,
    chars,
    ...(override ? { override } : {}),
    ...(problems.length
      ? { warning: `the prompt was typed, but ${problems.join('; ')}; do not send it again` }
      : {}),
  };
}
