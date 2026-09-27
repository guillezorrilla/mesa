import { toFail } from '../lib/result.js';
import { joinWarnings, type Recorded } from '../receipts/recorder.js';
import { closeSessionReceipt } from '../receipts/store.js';
import type { LockedNotesDeps } from '../vault/notes.js';
import type { SessionRecord } from './record.js';

// What a session's receipt says: the one its start wrote, and its end, marked on it later.

/** What a session receipt says of a session that started: its window, conversation, and place. */
export const startedOutputs = (r: SessionRecord) => ({
  window: r.tmux.window,
  agentSessionId: r.agentSessionId,
  lastState: r.lastState,
  parent: r.parent ?? null,
  ...(r.worktree ? { worktree: r.worktree } : {}),
});

/**
 * Marks `ended`'s opening receipt ended, best effort: a failure joins the recorded action's
 * warning instead of failing it.
 */
export async function markEnded<T>(
  /** Read inside the guard: a vault path that does not read is a warning too. */
  notes: () => LockedNotesDeps,
  recorded: Recorded<T>,
  ended: SessionRecord,
): Promise<Recorded<T>> {
  try {
    const vault = notes();
    const at = new Date(ended.endedAt ?? vault.clock());
    await closeSessionReceipt(vault, ended.id, at, { lastState: ended.lastState.state });
    return recorded;
  } catch (error) {
    const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
    return { ...recorded, warning: joinWarnings(recorded.warning, why) };
  }
}
