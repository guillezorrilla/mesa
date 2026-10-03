import { dangerousFlags, type LaunchDefaults } from '../agents/launch-flags.js';
import type { MesaContext } from '../context.js';
import { redactWhole } from '../lib/redact.js';
import { toFail } from '../lib/result.js';
import { joinWarnings, type Recorded } from '../receipts/recorder.js';
import { sessionReceipt, updateSessionReceipt } from '../receipts/store.js';
import type { SessionRecord } from './record.js';
import type { HeadlessResult } from './run.js';

// What a session's receipt says: the one its start wrote, and its end, marked on it later.

/** What updating a historical session receipt reads. */
type ReceiptContext = Pick<MesaContext, 'notes' | 'paths' | 'secrets' | 'deps'>;

/**
 * The launch flags an agent session started with that turn off its agent's permission checks or
 * sandbox (launch-flags.ts), as one line, which keeps its guardrail receipt (receipts/policy.ts);
 * nothing when there are none, or it has not started, or it resumed by attaching to a background
 * process started before it, which takes no flags (claude attach).
 */
export function dangerousLaunch(r: SessionRecord, defaults: LaunchDefaults) {
  if (r.kind !== 'interactive' || r.agent === 'terminal' || r.lastState.state === 'queued')
    return {};
  if (r.resumedFrom && r.backgroundId) return {};
  const flags = dangerousFlags(r.agent, defaults, r.mode);
  return flags.length ? { dangerousFlags: flags.join(' ') } : {};
}

/**
 * What a session receipt says of a session that started: its window, conversation, place (with
 * its additional projects'), and any dangerous launch flags under the profile's launch `defaults`.
 */
export const startedOutputs = (r: SessionRecord, defaults: LaunchDefaults) => ({
  window: r.tmux.window,
  agentSessionId: r.agentSessionId,
  lastState: r.lastState,
  parent: r.parent ?? null,
  ...(r.worktree ? { worktree: r.worktree } : {}),
  ...(r.additional ? { additional: r.additional } : {}),
  ...dangerousLaunch(r, defaults),
});

/** Text from the profile's logs as a receipt keeps it (redactWhole). */
const redactor = (ctx: ReceiptContext) => (text: string) =>
  redactWhole(text, ctx.deps.home, ctx.secrets());

/** How many of each event a session's record keeps: `{ send: 2, exited: 1 }` (CONTEXT.md, Session). */
function eventCounts(r: SessionRecord) {
  const counts: Record<string, number> = {};
  for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

/**
 * What a session's receipt says once its agent is through (stopped, or seen to exit): `failed`
 * when the session failed, else `ok`; its last state and its event counts as outputs; and its
 * local output remains under the profile, not in the vault.
 */
const endOf = (r: SessionRecord) => ({
  status: r.lastState.state === 'failed' ? ('failed' as const) : ('ok' as const),
  outputs: { lastState: r.lastState, events: eventCounts(r) },
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
  if (!recorded.receipt) return recorded;
  try {
    // Read inside the guard: a vault path that does not read is a warning too.
    const vault = ctx.notes();
    const at = new Date(ended.endedAt ?? vault.clock());
    await updateSessionReceipt(vault, ended.id, { ended: at, ...endOf(ended) });
    return recorded;
  } catch (error) {
    const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
    return { ...recorded, warning: joinWarnings(recorded.warning, why) };
  }
}

/**
 * Says in a session's opening receipt how it ended once its agent exited (endOf), as a stop
 * does, with ended on the receipt while the interactive record stays unstopped. Best
 * effort, and silent: tmux drops what its hook prints, and the stop that ends the session writes
 * it all again.
 */
export async function markExited(ctx: ReceiptContext, exited: SessionRecord) {
  try {
    const notes = ctx.notes();
    if (sessionReceipt(notes.vault, exited.id)?.receipt.ended) return;
    await updateSessionReceipt(notes, exited.id, {
      ended: new Date(exited.lastState.at),
      ...endOf(exited),
    });
  } catch {
    // Nowhere to say it; see above.
  }
}

/**
 * Finishes a skill run's receipt, the one its start wrote, from its result: ended, `ok` or
 * `failed` as the result is, `cost` its list price, and as outputs its last state and event
 * counts, its conversation, how long it took, where its result is (`output`, in the profile's
 * runs/, the home folder as ~), why it is not ok, and the vault note its output became; its last
 * output remains local to the profile. A warning when it cannot; never throws.
 */
export async function markRunEnded(
  ctx: ReceiptContext,
  run: SessionRecord,
  result: HeadlessResult,
  output: string,
): Promise<string | undefined> {
  try {
    if (!sessionReceipt(ctx.notes().vault, run.id)) return undefined;
    const redact = redactor(ctx);
    const end = endOf(run);
    await updateSessionReceipt(ctx.notes(), run.id, {
      ended: new Date(run.endedAt ?? ctx.deps.clock()),
      status: result.ok ? 'ok' : 'failed',
      cost: result.costUsd,
      outputs: {
        ...end.outputs,
        agentSessionId: result.agentSessionId,
        durationMs: result.durationMs,
        ...(result.usage ? { usage: result.usage } : {}),
        output: redact(output),
        ...(result.reason ? { reason: redact(result.reason) } : {}),
        ...(result.note ? { note: result.note } : {}),
      },
    });
    return undefined;
  } catch (error) {
    return `run ${run.id}'s receipt not finished: ${toFail(error).error.message}`;
  }
}
