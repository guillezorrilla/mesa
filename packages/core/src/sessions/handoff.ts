import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readyAgent } from '../agents/agents.js';
import type { IdSource } from '../lib/ids.js';
import { MesaError, toFail } from '../lib/result.js';
import { joinWarnings } from '../receipts/recorder.js';
import { requireCommandFits } from './goal.js';
import { requireOwnWorktree } from './holders.js';
import { type LaunchDeps, launchProject, launchSession } from './launch.js';
import { refuseRun, type SessionRecord } from './record.js';
import { isAgentState } from './states.js';
import type { StopOutcome } from './stop.js';

// A handoff (CONTEXT.md, Handoff): a session's work continues in a successor that starts from the
// same goal and a note of where the work stands.

const NOTE_LINE = /\n\nRead the handoff note at .+ first\.$/;

/** The successor's goal: the session's own, its earlier handoff line dropped, then its note's. */
const handoffGoal = (goal: string, note: string) =>
  `${goal.replace(NOTE_LINE, '')}\n\nRead the handoff note at ${note} first.`;

type HandoffDeps = LaunchDeps & {
  newUuid: IdSource;
  /** Where notes are kept, `<successor id>.md` each. */
  handoffs: string;
};

/**
 * Starts the successor of session `id`: on the same project, with the same agent, in the same
 * folder, taking over its worktree, with `parent` and `handoffFrom` the session, and a goal made
 * of the session's plus a line naming the note, copied to `handoffs/<successor id>.md`. Both
 * records get a `handoff` event. A skill run has nothing to hand off. Every refusal comes before
 * anything is written, and a window that cannot open removes the successor and its note again.
 * Stopping the session is the caller's; `keep` only refuses a session in its own worktree, which
 * two sessions never share.
 */
export async function handoffSession(
  deps: HandoffDeps,
  id: string,
  { note, keep = false }: { note: string; keep?: boolean },
): Promise<{ from: SessionRecord; to: SessionRecord; note: string; warning?: string }> {
  const from = deps.store.get(id);
  refuseRun(from, 'has no work to hand off');
  if (!isAgentState(from.lastState.state)) {
    throw new MesaError(
      'usage',
      `session ${id} never ran (${from.lastState.state}): no work to hand off`,
    );
  }
  if (!from.goal) {
    throw new MesaError(
      'usage',
      `session ${id} has no goal for a successor to start from; open one with mesa open --goal`,
    );
  }
  if (!existsSync(note)) throw new MesaError('not_found', `no handoff note at ${note}`);
  const { worktree } = from;
  if (worktree && keep) {
    throw new MesaError(
      'usage',
      `session ${id} runs in its own worktree, which its successor takes over; two sessions never share one, so it cannot be kept`,
    );
  }
  requireOwnWorktree(deps.store, from);
  const { entry } = launchProject(deps.profile, from.project);
  const spec = await readyAgent(deps.run, from.agent);
  const agentSessionId = deps.newUuid();
  const { goal } = from;
  // Checked before anything is written, with a note path as long as the successor's will be.
  requireCommandFits(
    spec.start(agentSessionId, handoffGoal(goal, join(deps.handoffs, 'xxxxxxxx.md'))),
  );
  const at = deps.clock().toISOString();
  // The note is copied once the successor has its id, and removed again with it.
  let path = '';
  const { record: to, warning } = await launchSession(
    deps,
    {
      project: entry,
      agent: from.agent,
      agentSessionId,
      parent: id,
      ...(worktree ? { worktree } : {}),
      ...(from.cwd ? { cwd: from.cwd } : {}),
    },
    {
      prepare: (created) => {
        path = join(deps.handoffs, `${created.id}.md`);
        mkdirSync(deps.handoffs, { recursive: true, mode: 0o700 });
        copyFileSync(note, path);
        return deps.store.update(created.id, {
          goal: handoffGoal(goal, path),
          handoffFrom: id,
          events: [{ type: 'handoff', at, from: id, note: path }],
        });
      },
      command: (successor) => spec.start(agentSessionId, successor.goal),
    },
  ).catch((error) => {
    if (path) rmSync(path, { force: true });
    throw error;
  });
  // The successor runs now, so marking the session is best effort: a failure is a warning, never
  // a failed handoff that a retry would start twice.
  try {
    const marked = deps.store.update(id, (current) => ({
      events: [...current.events, { type: 'handoff', at, to: to.id, note: path }],
    }));
    return { from: marked, to, note: path, ...(warning ? { warning } : {}) };
  } catch (error) {
    const why = `session ${id} not marked handed off: ${toFail(error).error.message}`;
    return { from, to, note: path, warning: joinWarnings(warning, why) };
  }
}

// ponytail: a guess at how long a session's agent takes to finish its turn once mesa handoff
// returns; its stop's Escape interrupts whatever it still writes, which is only its goodbye.
/** How long a session that handed itself off keeps running before the server stops it. */
const SELF_STOP_DELAY_S = 2;

/**
 * How a handed-off session stops: not with `keep`; from the tmux server a moment later when it
 * hands itself off (`self`), as its own stop would kill this mesa half-way; else at once. The
 * successor runs already, so a stop that fails is a warning, never a failed handoff that a retry
 * would start a second successor for.
 */
export async function stopHandedOff(
  deps: {
    /** The session hands itself off, from inside its own window. */
    self: boolean;
    stopLater: (args: string[], seconds: number) => Promise<void>;
    stopNow: (id: string) => Promise<{ outcome: StopOutcome; warning?: string }>;
  },
  id: string,
  keep: boolean,
): Promise<{ stop: StopOutcome | 'kept' | 'later' | 'failed'; warning?: string }> {
  if (keep) return { stop: 'kept' };
  try {
    if (deps.self) {
      await deps.stopLater(['stop', id], SELF_STOP_DELAY_S);
      return { stop: 'later' };
    }
    const { outcome, warning } = await deps.stopNow(id);
    return { stop: outcome, ...(warning ? { warning } : {}) };
  } catch (error) {
    return {
      stop: 'failed',
      warning: `session ${id} not stopped: ${toFail(error).error.message}; mesa stop ${id}`,
    };
  }
}
