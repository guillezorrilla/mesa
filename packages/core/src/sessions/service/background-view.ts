import { claudeBackgroundAttach } from '../../agents/claude/background.js';
import type { MesaContext } from '../../context.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { isOver } from '../record/lifecycle.js';
import { type LaunchDeps, launchProject, startSession } from '../start/launch.js';
import { killIfThere } from '../tmux/backend.js';
import { windowOf } from '../window/window-name.js';

/**
 * Makes sure a session kept running in the background (a Claude background process) has a tmux
 * view: a closed view does not end the process, so one is recreated on demand, launched with
 * `launch`'s deps.
 */
export function backgroundView(
  ctx: Pick<MesaContext, 'open' | 'store' | 'tmux'>,
  launch: () => LaunchDeps,
) {
  const { open, store, tmux } = ctx;
  return async (id: string) => {
    const found = store.get(id);
    const nativeId = found.backgroundId;
    if (!nativeId || found.endedAt || isOver(found)) return;
    const target = windowOf(found);
    const pane = await tmux.findWindow(target);
    if (pane && !pane.dead) return;
    if (pane) await killIfThere(tmux, target);
    const project =
      found.project === GENERAL_PROJECT ? null : launchProject(open(), found.project).entry;
    await startSession(launch(), found, project, {
      command: () => claudeBackgroundAttach(nativeId),
    });
  };
}
