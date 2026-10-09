import type { MesaContext } from '../../context.js';
import { toFail } from '../../lib/result.js';
import { hasConversation } from '../../sessions/native/conversation.js';
import { GENERAL_PROJECT } from '../../sessions/record/general.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { RunInput, startRun } from '../../sessions/run/start.js';
import { readHookEvents } from '../../sessions/signals/hook-events.js';
import { VAULT_CAPTURE } from '../../skills/library.js';
import { requireLog } from '../notes.js';
import { claimCapture } from './claim.js';
import { captureFailed } from './land.js';

// When a session's end starts its Vault capture (CONTEXT.md): from the end signals (end-signals.ts),
// a detached vault-capture run over the messages newer than its last capture, which its own end
// lands (finishRun).

/** What starting a capture takes beside the context: a skill run's start, not waited for. */
export type CaptureTrigger = Pick<
  MesaContext,
  'store' | 'clock' | 'record' | 'paths' | 'home' | 'env' | 'configIfAny' | 'secrets'
> & {
  /** startRun with the run's deps and a guardrail that lets Mesa's own prompt through. */
  start: (input: RunInput) => ReturnType<typeof startRun>;
};

/**
 * Whether session `s`'s end is captured, cheapest checks first, so with capture off nothing past
 * its config is read: the profile has capture on (`vault.capture`) and a laid-out vault; `s` is
 * an interactive Claude Code or Codex session on a project, with a conversation. Its claim
 * (claimCapture) then needs no capture in flight and messages newer than its mark.
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
  return hasConversation(s, readHookEvents(deps.paths.events, s.id));
}

/**
 * Starts session `id`'s capture when it is due: the record claims it under its lock, so every
 * end signal of one session (its agent's SessionEnd, tmux's pane-died, a stop, a Board look)
 * starts at most one run at a time, which is not waited for; a stale claim is taken again, and a
 * later end starts another only for messages newer than the last capture. A start that fails
 * never fails the signal: the record and a failed receipt say why, and the warning comes back.
 */
export async function startCapture(deps: CaptureTrigger, id: string): Promise<string | undefined> {
  const found = deps.store.find(id);
  let claim: ReturnType<typeof claimCapture> | undefined;
  try {
    claim = found && due(deps, found) ? claimCapture(deps, found) : undefined;
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
