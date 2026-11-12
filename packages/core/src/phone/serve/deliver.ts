import { toFail } from '../../lib/result.js';
import { BUSY_STATES, WAITING_STATES } from '../../sessions/record/states.js';
import type { PhoneRow } from '../protocol/rpc.js';
import type { PhoneQueue } from './queue.js';

/** Whether a reply to a session in `state` waits for its turn to end (CONTEXT.md, Queued message). */
export const waitsForTurn = (state: string) => (BUSY_STATES as ReadonlySet<string>).has(state);

const waitsOnPerson = (state: string) => (WAITING_STATES as ReadonlySet<string>).has(state);

/**
 * Types each queued message whose session's turn has ended, oldest first, one per session per
 * pass, past an ask only when the person said Send anyway. A session at work keeps its messages,
 * as does one waiting on a person (#1018 answers that). A send that fails keeps its message with
 * the reason, and holds the session's later ones behind it, in order, until the person removes it.
 */
export async function deliverQueued(
  queue: PhoneQueue,
  rows: readonly PhoneRow[],
  send: (id: string, text: string, yes: boolean) => Promise<unknown>,
) {
  const state = new Map(rows.map((row) => [row.id, row.state]));
  const tried = new Set<string>();
  for (const held of queue.all()) {
    if (tried.has(held.session)) continue;
    tried.add(held.session);
    if (held.error) continue;
    const now = state.get(held.session);
    if (now === undefined) {
      queue.fail(held.id, 'the session is no longer on the board');
      continue;
    }
    if (waitsForTurn(now) || waitsOnPerson(now)) continue;
    try {
      await send(held.session, held.text, held.yes);
      queue.remove(held.id);
    } catch (error) {
      queue.fail(held.id, toFail(error).error.message);
    }
  }
}
