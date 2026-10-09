import type { MesaContext } from '../../context.js';
import { MesaError } from '../../lib/result.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { HeadlessResult } from '../../sessions/run/files.js';
import type { RunInput } from '../../sessions/run/start.js';
import { VAULT_CAPTURE } from '../../skills/library.js';
import { requireLog } from '../notes.js';

/** A Skill run, waited for (the sessions service's run). */
type WaitedRun = (
  skill: string,
  opts: Omit<RunInput, 'skill'> & { yes?: boolean },
) => Promise<Recorded<HeadlessResult & { session: string }>>;

/** How a capture by hand went: its run, and the notes it saved, or why it saved none. */
export type Captured = {
  session: string;
  run: string;
  ok: boolean;
  notes: string[];
  reason?: string;
};

/**
 * Captures session `id` now (`mesa vault capture`), whatever captured it before: one
 * vault-capture run about it, waited for and landed as an automatic one is (landCapture), on an
 * interactive session with a laid-out vault. The run, and what its landing kept on the record.
 */
export async function captureByHand(
  deps: Pick<MesaContext, 'store' | 'vaultOf'> & { run: WaitedRun },
  id: string,
): Promise<Recorded<Captured>> {
  const about = deps.store.get(id);
  if (about.kind !== 'interactive') {
    throw new MesaError(
      'usage',
      `session ${id} is a ${about.kind}: only an agent's conversation is captured`,
    );
  }
  requireLog(deps.vaultOf());
  const recorded = await deps.run(VAULT_CAPTURE, { session: id, yes: true });
  const run = recorded.result.session;
  const capture = deps.store.get(id).capture;
  const mine = capture?.run === run ? capture : undefined;
  const ok = mine?.state === 'done';
  const reason = ok
    ? undefined
    : (mine?.reason ?? recorded.result.reason ?? 'the capture did not land');
  return {
    ...recorded,
    result: { session: id, run, ok, notes: mine?.notes ?? [], ...(reason ? { reason } : {}) },
  };
}
