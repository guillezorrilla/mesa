import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readyAgent } from '../agents/agents.js';
import type { IdSource } from '../lib/ids.js';
import type { Runner } from '../lib/process.js';
import { MesaError, toFail } from '../lib/result.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { joinWarnings } from '../receipts/recorder.js';
import { requireCommandFits } from './goal.js';
import { requireOwnWorktree } from './holders.js';
import { agentFolder, createRecord, type LaunchDeps, openWindowOf } from './launch.js';
import { syncSkillsInto } from './open.js';
import { isAgentState, type SessionRecord } from './record.js';

// A handoff (CONTEXT.md, Handoff): a session's work continues in a successor that starts from the
// same goal and a note of where the work stands.

const NOTE_LINE = /\n\nRead the handoff note at .+ first\.$/;

/** The successor's goal: the session's own, its earlier handoff line dropped, then its note's. */
const handoffGoal = (goal: string, note: string) =>
  `${goal.replace(NOTE_LINE, '')}\n\nRead the handoff note at ${note} first.`;

type HandoffDeps = LaunchDeps & {
  run: Runner;
  newUuid: IdSource;
  syncSkills: (project: string, folder: string) => void;
  /** Where notes are kept, `<successor id>.md` each. */
  handoffs: string;
};

/**
 * Starts the successor of session `id`: on the same project, with the same agent, in the same
 * folder, taking over its worktree, with `parent` and `handoffFrom` the session, and a goal made
 * of the session's plus a line naming the note, copied to `handoffs/<successor id>.md`. Both
 * records get a `handoff` event. Every refusal comes before anything is written, and a window
 * that cannot open removes the successor and its note again. Stopping the session is the
 * caller's; `keep` only refuses a session in its own worktree, which two sessions never share.
 */
export async function handoffSession(
  deps: HandoffDeps,
  id: string,
  { note, keep = false }: { note: string; keep?: boolean },
): Promise<{ from: SessionRecord; to: SessionRecord; note: string; warning?: string }> {
  const from = deps.store.get(id);
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
  const entry = findProject(deps.profile, from.project);
  // Still a project, as open requires.
  readProjectFile(entry.path);
  const spec = await readyAgent(deps.run, from.agent);
  const agentSessionId = deps.newUuid();
  // Checked before anything is written, with a note path as long as the successor's will be.
  requireCommandFits(
    spec.start(agentSessionId, handoffGoal(from.goal, join(deps.handoffs, 'xxxxxxxx.md'))),
  );
  const created = createRecord(deps, {
    project: entry,
    agent: from.agent,
    agentSessionId,
    parent: id,
    ...(worktree ? { worktree } : {}),
    ...(from.cwd ? { cwd: from.cwd } : {}),
  });
  const path = join(deps.handoffs, `${created.id}.md`);
  const goal = handoffGoal(from.goal, path);
  const at = deps.clock().toISOString();
  let to: SessionRecord;
  let warning: string | undefined;
  try {
    mkdirSync(deps.handoffs, { recursive: true, mode: 0o700 });
    copyFileSync(note, path);
    to = deps.store.update(created.id, {
      goal,
      handoffFrom: id,
      events: [{ type: 'handoff', at, from: id, note: path }],
    });
    warning = syncSkillsInto(deps, entry.name, agentFolder(to, entry));
    await openWindowOf(deps, to, entry, spec.start(agentSessionId, goal));
  } catch (error) {
    deps.store.remove(created.id);
    rmSync(path, { force: true });
    throw error;
  }
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
