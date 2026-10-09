import { AGENTS } from '../../agents/agents.js';
import type { MesaContext } from '../../context.js';
import { hasConversation } from '../../sessions/native/conversation.js';
import { GENERAL_PROJECT } from '../../sessions/record/general.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { RunInput, startRun } from '../../sessions/run/start.js';
import { readHookEvents } from '../../sessions/signals/hook-events.js';
import { VAULT_CAPTURE } from '../../skills/library.js';
import { requireLog } from '../notes.js';
import { captureFailed } from './land.js';

// When a session's end starts its Vault capture (CONTEXT.md): from the end signals (end-signals.ts),
// a detached vault-capture run that its own end lands (finishRun), once per session.

// A claim is made before its run starts; a process that died in between left it with no run.
/** How old a claim with no run is before another end signal may claim it again. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Whether `s` has no capture yet, or only a claim with no run older than STALE_CLAIM_MS. */
const unclaimed = (s: SessionRecord, now: Date) =>
  !s.capture ||
  (s.capture.state === 'running' &&
    !s.capture.run &&
    now.getTime() - Date.parse(s.capture.at) > STALE_CLAIM_MS);

/** What starting a capture takes beside the context: a skill run's start, not waited for. */
export type CaptureTrigger = Pick<
  MesaContext,
  'store' | 'clock' | 'record' | 'paths' | 'home' | 'env' | 'configIfAny'
> & {
  /** startRun with the run's deps and a guardrail that lets Mesa's own prompt through. */
  start: (input: RunInput) => ReturnType<typeof startRun>;
};

/**
 * Whether session `s` is one whose end is captured: an interactive Claude Code or Codex session on
 * a project, its native transcript on disk and a conversation in it, while the profile has
 * capture on (`vault.capture`) and a laid-out vault, and nothing captured it yet (unclaimed).
 */
function due(deps: CaptureTrigger, s: SessionRecord) {
  if (!unclaimed(s, deps.clock()) || s.kind !== 'interactive' || s.project === GENERAL_PROJECT)
    return false;
  if (s.agent !== 'claude' && s.agent !== 'codex') return false;
  const config = deps.configIfAny();
  if (!config?.vaultCapture) return false;
  try {
    requireLog(config.vault);
  } catch {
    return false;
  }
  return (
    Boolean(s.agentSessionId && AGENTS[s.agent].transcripts.file(deps, s.agentSessionId)) &&
    hasConversation(s, readHookEvents(deps.paths.events, s.id))
  );
}

/**
 * Starts session `id`'s capture when it is due, once: the record claims it under its lock, so
 * every end signal of one session (its agent's SessionEnd, tmux's pane-died, a stop, a Board
 * look) starts at most one run, which is not waited for; a stale claim is taken again. A start that fails never fails the signal: the record
 * and a failed receipt say why, and the warning comes back.
 */
export async function startCapture(deps: CaptureTrigger, id: string): Promise<string | undefined> {
  const found = deps.store.find(id);
  if (!found || !due(deps, found)) return undefined;
  let claimed = false;
  const about = deps.store.update(id, (current) => {
    const now = deps.clock();
    if (!unclaimed(current, now)) return {};
    claimed = true;
    return { capture: { at: now.toISOString(), state: 'running' as const } };
  });
  if (!claimed) return undefined;
  try {
    const { record: run } = await deps.start({ skill: VAULT_CAPTURE, session: id });
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
