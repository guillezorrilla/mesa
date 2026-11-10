import { existsSync } from 'node:fs';
import { MesaError } from '../../lib/result.js';
import { findProject } from '../../projects/projects.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
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
  if (!found.sleeping) throw notAsleep(id);
  const project =
    found.project === GENERAL_PROJECT ? null : findProject(deps.profile, found.project);
  const folder = folderOf(found, project);
  if (!existsSync(folder))
    throw new MesaError('not_found', `session ${id}'s folder ${folder} is gone`);
  // A window left from the sleep (a pane that stayed dead) gives way to the new one.
  await killIfThere(deps.tmux, windowOf(found));
  const slept = found.sleeping;
  let claimed = false;
  const record = deps.store.update(id, (current) => {
    if (current.sleeping?.at !== slept.at) return {};
    claimed = true;
    return { sleeping: undefined };
  });
  if (!claimed) throw notAsleep(id);
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
