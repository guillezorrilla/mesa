import type { MesaContext } from '../../context.js';
import { toFail } from '../../lib/result.js';
import { hasConversation } from '../../sessions/native/conversation.js';
import { GENERAL_PROJECT } from '../../sessions/record/general.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { RunInput, startRun } from '../../sessions/run/start.js';
import { readHookEvents } from '../../sessions/signals/hook-events.js';
import { VAULT_CAPTURE } from '../../skills/library.js';
import { requireLog } from '../notes.js';
import { CAPTURE_MIN_MESSAGES, captureTimeDue, claimCapture } from './claim.js';
import { captureFailed } from './land.js';

// When a turn's end starts its session's Vault capture (CONTEXT.md): from the agent's Stop hook
// (end-signals.ts), a detached vault-capture run over the messages newer than its last capture,
// once enough time has passed and enough has been said; the run's own end lands it (finishRun).

/** What starting a capture takes beside the context: a skill run's start, not waited for. */
export type CaptureTrigger = Pick<
  MesaContext,
  'store' | 'clock' | 'record' | 'paths' | 'home' | 'env' | 'configIfAny' | 'secrets'
> & {
  /** startRun with the run's deps and a guardrail that lets Mesa's own prompt through. */
  start: (input: RunInput) => ReturnType<typeof startRun>;
};

/**
 * Whether a turn's end captures session `s`, cheapest checks first, so a turn that is not due
 * reads no transcript: the profile has capture on (`vault.capture`) and a laid-out vault; `s` is
 * an interactive Claude Code or Codex session on a project, last captured (else started) at least
 * CAPTURE_EVERY_MS ago, with a conversation. Its claim (claimCapture) then needs no capture in
 * flight and at least CAPTURE_MIN_MESSAGES messages newer than its mark.
 */
function due(deps: CaptureTrigger, s: SessionRecord) {
  const config = deps.configIfAny();
  if (!config?.vaultCapture) return false;
  try {
    requireLog(config.vault);
  } catch {
    return false;
  }
  if (s.kind !== 'interactive' || s.project === GENERAL_PROJECT) return false;
  if (s.agent !== 'claude' && s.agent !== 'codex') return false;
  if (!captureTimeDue(s, deps.clock())) return false;
  return hasConversation(s, readHookEvents(deps.paths.events, s.id));
}

/**
 * Starts session `id`'s capture at a turn's end when it is due (due): the record claims it under
 * its lock, so one session has at most one run at a time, which is not waited for; a stale claim
 * is taken again, and a later turn starts another only for enough messages newer than the last
 * capture. A start that fails never fails the turn's hook: the record and a failed receipt say
 * why, and the warning comes back.
 */
export async function startCapture(deps: CaptureTrigger, id: string): Promise<string | undefined> {
  const found = deps.store.find(id);
  let claim: ReturnType<typeof claimCapture> | undefined;
  try {
    claim = found && due(deps, found) ? claimCapture(deps, found, CAPTURE_MIN_MESSAGES) : undefined;
  } catch (error) {
    return `session ${id}'s vault capture did not start: ${toFail(error).error.message}`;
  }
  if (!claim || 'refused' in claim) return undefined;
  const { about, input } = claim;
  try {
    const { record: run } = await deps.start({
      skill: VAULT_CAPTURE,
      session: id,
      input: input.text,
    });
    // A run quick enough to land first has already written its own outcome.
    deps.store.update(id, (current) =>
      current.capture?.state === 'running' && !current.capture.run
        ? { capture: { ...current.capture, run: run.id } }
        : {},
    );
    return undefined;
  } catch (error) {
    const reason = await captureFailed(deps, about, error);
    return `session ${id}'s vault capture did not start: ${reason}`;
  }
}
