import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { toFail } from '../lib/result.js';
import { joinWarnings, type Recorded } from '../receipts/recorder.js';
import { updateSessionReceipt } from '../receipts/store.js';
import { outputLog, outputTail } from './output-log.js';
import type { SessionRecord } from './record.js';

// What a session's receipt says: the one its start wrote, and its end, marked on it later.

/** How many of a session's last output lines its receipt keeps in its Details. */
const RECEIPT_LINES = 200;

/** What updating a session receipt reads: the vault, the output logs, and what to redact. */
type ReceiptContext = Pick<MesaContext, 'notes' | 'paths' | 'secrets' | 'deps'>;

/** What a session receipt says of a session that started: its window, conversation, and place. */
export const startedOutputs = (r: SessionRecord) => ({
  window: r.tmux.window,
  agentSessionId: r.agentSessionId,
  lastState: r.lastState,
  parent: r.parent ?? null,
  ...(r.worktree ? { worktree: r.worktree } : {}),
});

/**
 * A receipt's Details for session `id`'s output: its last RECEIPT_LINES lines (outputTail), the
 * home folder and the profile's key values redacted, in a fence longer than any run of backticks
 * in them, so Obsidian renders none of it. Undefined when it has no output log, or no lines in it.
 */
function outputDetails(ctx: ReceiptContext, id: string) {
  const lines = outputTail(ctx.paths.logs, id, RECEIPT_LINES);
  if (!lines?.length) return undefined;
  const redact = (text: string) =>
    redactPayload(text, ctx.deps.home, ctx.secrets(), Number.POSITIVE_INFINITY) as string;
  const text = redact(lines.join('\n'));
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const where = redact(outputLog(ctx.paths.logs, id));
  const last = lines.length === 1 ? 'line' : `${lines.length} lines`;
  const said = `The last ${last} of its output; the whole log stays on this machine, at ${where}.`;
  return `${said}\n\n${fence}text\n${text}\n${fence}`;
}

/**
 * Marks `ended`'s opening receipt ended, its last output lines in its Details, best effort: a
 * failure joins the recorded action's warning instead of failing it.
 */
export async function markEnded<T>(
  ctx: ReceiptContext,
  recorded: Recorded<T>,
  ended: SessionRecord,
): Promise<Recorded<T>> {
  try {
    // Read inside the guard: a vault path that does not read is a warning too.
    const vault = ctx.notes();
    const at = new Date(ended.endedAt ?? vault.clock());
    await updateSessionReceipt(vault, ended.id, {
      ended: at,
      outputs: { lastState: ended.lastState.state },
      details: outputDetails(ctx, ended.id),
    });
    return recorded;
  } catch (error) {
    const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
    return { ...recorded, warning: joinWarnings(recorded.warning, why) };
  }
}

/**
 * Puts the last output lines of a session whose agent exited into its opening receipt's Details,
 * as a stop does, though the session is not stopped (pane-died). Best effort, and silent: tmux
 * drops what its hook prints, and the stop that ends the session writes them again.
 */
export async function markExited(ctx: ReceiptContext, exited: SessionRecord) {
  try {
    const details = outputDetails(ctx, exited.id);
    if (details) await updateSessionReceipt(ctx.notes(), exited.id, { details });
  } catch {
    // Nowhere to say it; see above.
  }
}
