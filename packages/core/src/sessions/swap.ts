import { rmSync } from 'node:fs';
import { newSessionId, startCommand } from '../agents/agents.js';
import type { IdSource } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { additionalDirs } from './additional.js';
import { hasConversation } from './conversation.js';
import { GENERAL_PROJECT } from './general.js';
import { eventsLog, readHookEvents } from './hook-events.js';
import { type LaunchDeps, launchAgent, launched, startSession } from './launch.js';
import { isOver, type SessionRecord } from './record.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { windowName, windowOf } from './window-name.js';

/**
 * Swaps a fresh session's agent (CONTEXT.md, Swap): the same Mesa session, folder, and worktrees,
 * with `to` started in a new window `<to>-<id>` under a new agent session id, then the old window
 * closed. The record moves to the new window first, so the old pane's death is no session's. A
 * launch that fails puts the record back, with the old agent still running. A session with a
 * conversation, a busy or ended one, a terminal, a run, a background one, and the agent it
 * already runs are usage errors; an agent Mesa cannot run is agent_unavailable.
 */
export async function swapAgent(
  deps: LaunchDeps & {
    tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow' | 'killWindow'>;
    newUuid: IdSource;
    /** The hook logs, `sessions/events/`. */
    eventsDir: string;
  },
  id: string,
  to: string,
): Promise<{ record: SessionRecord; warning?: string }> {
  const found = deps.store.get(id);
  const refuse = (why: string) => new MesaError('usage', `session ${id} ${why}`);
  if (found.kind !== 'interactive' || found.agent === 'terminal')
    throw refuse(
      `is a ${found.agent === 'terminal' ? 'terminal' : found.kind}; only an agent session swaps`,
    );
  if (isOver(found) || found.lastState.state === 'queued')
    throw refuse(`is not running; mesa open a new one with --agent ${to}`);
  if (found.background) throw refuse("runs in Claude's background mode, which only Claude has");
  const { agent } = await launchAgent(deps, undefined, to);
  if (agent === found.agent) throw refuse(`already runs ${agent}`);
  if (found.lastState.state === 'working') throw refuse('is working; swap it once it is idle');
  if (hasConversation(found, readHookEvents(deps.eventsDir, id)))
    throw refuse(
      `has a conversation, which ${agent} cannot carry on: mesa handoff ${id} --agent ${agent} --note <file>`,
    );
  const project =
    found.project === GENERAL_PROJECT ? null : findProject(deps.profile, found.project);
  const agentSessionId = newSessionId(agent, deps.newUuid);
  const before = {
    agent: found.agent,
    agentSessionId: found.agentSessionId,
    mode: found.mode,
    tmux: found.tmux,
    lastState: found.lastState,
    vaultMounted: found.vaultMounted,
  };
  const swapped = deps.store.update(id, {
    agent,
    agentSessionId,
    // A startup mode is the old agent's; the new one starts plain.
    mode: undefined,
    tmux: { ...found.tmux, window: windowName(agent, id) },
    lastState: launched(deps.clock().toISOString()),
    vaultMounted: undefined,
  });
  // The old agent's hooks spoke for it, not for the new one, whose first events come next.
  rmSync(eventsLog(deps.eventsDir, id), { force: true });
  let started: { record: SessionRecord; warning?: string };
  try {
    started = await startSession(deps, swapped, project, {
      command: (record) =>
        startCommand(
          agent,
          deps.vaultServer,
          deps.profile.config.agents,
          {
            id: record.id,
            logs: deps.profile.paths.logs,
            agentSessionId,
          },
          additionalDirs(record),
        ),
    });
  } catch (error) {
    deps.store.update(id, before);
    throw error;
  }
  await killIfThere(deps.tmux, windowOf(found));
  return started;
}
