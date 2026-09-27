import type { MesaContext } from '../context.js';
import { redactWhole } from '../lib/redact.js';
import { toFail } from '../lib/result.js';
import { joinWarnings, type Recorded } from '../receipts/recorder.js';
import { updateSessionReceipt } from '../receipts/store.js';
import { outputLog, outputTail } from './output-log.js';
import type { SessionRecord } from './record.js';
import type { HeadlessResult } from './run.js';

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

/** Text from the profile's logs as a receipt keeps it (redactWhole). */
const redactor = (ctx: ReceiptContext) => (text: string) =>
  redactWhole(text, ctx.deps.home, ctx.secrets());

/**
 * A receipt's Details for session `id`'s output: its last RECEIPT_LINES lines (outputTail), the
 * home folder and the profile's key values redacted, in a fence longer than any run of backticks
 * in them, so Obsidian renders none of it. Undefined when it has no output log, or no lines in it.
 */
function outputDetails(ctx: ReceiptContext, id: string) {
  const lines = outputTail(ctx.paths.logs, id, RECEIPT_LINES);
  if (!lines?.length) return undefined;
  const redact = redactor(ctx);
  const text = redact(lines.join('\n'));
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const where = redact(outputLog(ctx.paths.logs, id));
  const last = lines.length === 1 ? 'line' : `${lines.length} lines`;
  const said = `The last ${last} of its output; the whole log stays on this machine, at ${where}.`;
  return `${said}\n\n${fence}text\n${text}\n${fence}`;
}

/** How many of each event a session's record keeps: `{ send: 2, exited: 1 }` (CONTEXT.md, Session). */
function eventCounts(r: SessionRecord) {
  const counts: Record<string, number> = {};
  for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

/**
 * What a session's receipt says once its agent is through (stopped, or seen to exit): `failed`
 * when the session failed, else `ok`; its last state and its event counts as outputs; and its
 * last output lines as its Details.
 */
const endOf = (ctx: ReceiptContext, r: SessionRecord) => ({
  status: r.lastState.state === 'failed' ? ('failed' as const) : ('ok' as const),
  outputs: { lastState: r.lastState.state, events: eventCounts(r) },
  details: outputDetails(ctx, r.id),
});

/**
 * Marks `ended`'s opening receipt ended, with how it ended (endOf), best effort: a failure joins
 * the recorded action's warning instead of failing it.
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
    await updateSessionReceipt(vault, ended.id, { ended: at, ...endOf(ctx, ended) });
    return recorded;
  } catch (error) {
    const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
    return { ...recorded, warning: joinWarnings(recorded.warning, why) };
  }
}

/**
 * Says in a session's opening receipt how it ended once its agent exited (endOf), as a stop
 * does, though the session is not stopped (pane-died), so the receipt is not marked ended. Best
 * effort, and silent: tmux drops what its hook prints, and the stop that ends the session writes
 * it all again.
 */
export async function markExited(ctx: ReceiptContext, exited: SessionRecord) {
  try {
    await updateSessionReceipt(ctx.notes(), exited.id, endOf(ctx, exited));
  } catch {
    // Nowhere to say it; see above.
  }
}

/**
 * Finishes a skill run's receipt, the one its start wrote, from its result: ended, `ok` or
 * `failed` as the result is, `cost` its list price, and as outputs its last state and event
 * counts, its conversation, how long it took, where its result is (`output`, in the profile's
 * runs/, the home folder as ~), why it is not ok, and the vault note its output became; its last
 * output lines (its stderr) as its Details. A warning when it cannot; never throws.
 */
export async function markRunEnded(
  ctx: ReceiptContext,
  run: SessionRecord,
  result: HeadlessResult,
  output: string,
): Promise<string | undefined> {
  try {
    const redact = redactor(ctx);
    const end = endOf(ctx, run);
    await updateSessionReceipt(ctx.notes(), run.id, {
      ended: new Date(run.endedAt ?? ctx.deps.clock()),
      status: result.ok ? 'ok' : 'failed',
      cost: result.costUsd,
      outputs: {
        ...end.outputs,
        agentSessionId: result.agentSessionId,
        durationMs: result.durationMs,
        output: redact(output),
        ...(result.reason ? { reason: redact(result.reason) } : {}),
        ...(result.note ? { note: result.note } : {}),
      },
      details: end.details,
    });
    return undefined;
  } catch (error) {
    return `run ${run.id}'s receipt not finished: ${toFail(error).error.message}`;
  }
}
