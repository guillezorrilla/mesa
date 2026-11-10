import { existsSync } from 'node:fs';
import { readyAgent } from '../../doctor/probe.js';
import { MesaError } from '../../lib/result.js';
import { findProject } from '../../projects/projects.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
import { scanHookEvents } from '../signals/hook-events.js';
import { killIfThere, type TmuxBackend } from '../tmux/backend.js';
import { windowOf } from '../window/window-name.js';
import { folderOf, type LaunchDeps, startSession } from './launch.js';
import { resumeCommand } from './resume.js';

/**
 * Wakes a sleeping session (CONTEXT.md, Sleeping session): its conversation reopens in its own
 * window, in its folder and worktree, under the same Mesa session id. The wake is claimed under
 * the record's lock, so of two at once one starts and the other is refused; a start that fails
 * puts it back to sleep.
 */
export async function wakeSession(
  deps: LaunchDeps & { tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow' | 'killWindow'> },
  id: string,
): Promise<{ record: SessionRecord; warning?: string }> {
  const found = deps.store.get(id);
  if (!found.sleeping || found.endedAt || found.agent === 'terminal') throw notAsleep(id);
  const project =
    found.project === GENERAL_PROJECT ? null : findProject(deps.profile, found.project);
  const folder = folderOf(found, project);
  if (!existsSync(folder))
    throw new MesaError('not_found', `session ${id}'s folder ${folder} is gone`);
  await readyAgent(deps.run, found.agent);
  const slept = found.sleeping;
  let claimed = false;
  const at = deps.clock().toISOString();
  const record = deps.store.update(id, (current) => {
    if (current.sleeping?.at !== slept.at || current.endedAt) return {};
    claimed = true;
    // Its idle time starts again, so the next sleep pass waits the whole time anew.
    return {
      sleeping: undefined,
      // Idle from now: its agent starts again, and a `done` it slept as would read as exited.
      lastState: { ...current.lastState, state: 'idle' as const, at, source: 'tmux' as const },
      events: [...current.events, { type: 'woke' as const, at }],
    };
  });
  if (!claimed) throw notAsleep(id);
  // Claimed, so no other wake is opening it: a pane the sleep left dead gives way to the new one.
  const left = await deps.tmux.findWindow(windowOf(found));
  if (left?.dead) await killIfThere(deps.tmux, windowOf(found));
  try {
    return await startSession(deps, record, project, {
      command: (r, deny) => resumeCommand(deps, found, r.id, folder, deny),
    });
  } catch (error) {
    try {
      deps.store.update(id, (current) =>
        current.sleeping || current.endedAt ? {} : { sleeping: slept },
      );
    } catch {
      // The start's own error says more.
    }
    throw error;
  }
}

const notAsleep = (id: string) =>
  new MesaError('usage', `session ${id} is not asleep; mesa attach ${id}`);

/** How long a woken agent has to take input before a send types anyway (#898). */
export const WAKE_WAIT_MS = 30_000;
const POLL_MS = 250;

/**
 * Waits until session `id`'s agent logs a SessionStart at or after `since` (it takes input), up to
 * `timeoutMs`: whether it did.
 */
export async function agentStarted(
  deps: { eventsDir: string; sleep: (ms: number) => Promise<void> },
  id: string,
  since: string,
  timeoutMs = WAKE_WAIT_MS,
) {
  let offset = 0;
  let started = false;
  for (let waited = 0; ; waited += POLL_MS) {
    // Only the lines appended since the last look.
    offset = scanHookEvents(deps.eventsDir, id, offset, (e) => {
      started ||= e.event === 'SessionStart' && e.at >= since;
    });
    if (started) return true;
    if (waited >= timeoutMs) return false;
    await deps.sleep(POLL_MS);
  }
}
