import { z } from 'zod';
import { changeJson, readJson } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import { toFail } from '../../lib/result.js';
import { BUSY_STATES, WAITING_STATES } from '../../sessions/record/states.js';
import type { PhoneRow } from '../protocol/rpc.js';
import { type QueuedMessage, queuedMessage } from '../protocol/steer.js';

// The phone's replies to busy sessions, held in the profile until each turn ends (CONTEXT.md,
// Queued message): the listener types them, so they land with the app closed.

const QueueSchema = z.array(queuedMessage.extend({ session: z.string() })).describe('phone queue');
type Held = z.infer<typeof QueueSchema>[number];

/** The queue file (`phone-queue.json` in the profile), changed under its lock. */
export function phoneQueue(deps: {
  file: string;
  lock: LockDeps;
  clock: () => Date;
  newId: () => string;
}) {
  const all = () => readJson(deps.file, QueueSchema) ?? [];
  // An empty queue removes its file.
  const change = (next: (held: Held[]) => Held[]) =>
    changeJson(
      deps.file,
      QueueSchema,
      (held = []) => {
        const kept = next(held);
        return kept.length ? kept : undefined;
      },
      deps.lock,
    );
  const strip = ({ session: _, ...message }: Held): QueuedMessage => message;
  return {
    all,
    /** Session `id`'s messages, oldest first. */
    of: (id: string) =>
      all()
        .filter((held) => held.session === id)
        .map(strip),
    add: (session: string, text: string) =>
      void change((held) => [
        ...held,
        { id: deps.newId(), session, text, at: deps.clock().toISOString() },
      ]),
    remove: (id: string) => void change((held) => held.filter((m) => m.id !== id)),
    /** Keeps the message with why it could not be typed. */
    fail: (id: string, error: string) =>
      void change((held) => held.map((m) => (m.id === id ? { ...m, error } : m))),
  };
}
export type PhoneQueue = ReturnType<typeof phoneQueue>;

const has = (set: ReadonlySet<string>, state: string) => set.has(state);

/** Whether a reply to a session in `state` waits for its turn to end. */
export const waitsForTurn = (state: string) => has(BUSY_STATES, state);

/**
 * Types each queued message whose session's turn has ended, oldest first, one per session per
 * pass. A session at work keeps its messages, as does one waiting on a person (#1018 answers
 * that); any other is typed into, and a send that fails keeps its message with the reason.
 */
export async function deliverQueued(
  queue: PhoneQueue,
  rows: readonly PhoneRow[],
  send: (id: string, text: string) => Promise<unknown>,
) {
  const state = new Map(rows.map((row) => [row.id, row.state]));
  const tried = new Set<string>();
  for (const held of queue.all()) {
    if (held.error || tried.has(held.session)) continue;
    tried.add(held.session);
    const now = state.get(held.session);
    if (now === undefined) {
      queue.fail(held.id, 'the session is no longer on the board');
      continue;
    }
    if (waitsForTurn(now) || has(WAITING_STATES, now)) continue;
    try {
      await send(held.session, held.text);
      queue.remove(held.id);
    } catch (error) {
      queue.fail(held.id, toFail(error).error.message);
    }
  }
}
