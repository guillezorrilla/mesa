import { existsSync } from 'node:fs';
import { AGENTS, readyAgent } from '../agents/agents.js';
import { prepareAntigravityLog } from '../agents/antigravity/log.js';
import { claudeBackgroundAttach } from '../agents/claude/background.js';
import { MesaError, toFail } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { joinWarnings } from '../receipts/recorder.js';
import { GENERAL_PROJECT } from './general.js';
import { requireOwnWorktree, resumerOf } from './holders.js';
import { folderOf, type LaunchDeps, launchSession } from './launch.js';
import { ending, type SessionRecord } from './record.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';

/**
 * Reopens a session's agent conversation (`claude --resume`, `codex resume`) in its folder, in a
 * new window, as a new record
 * linked both ways: `resumedFrom` on the new one, `resumedBy` and `endedAt` on the old one. A
 * dead window the old session left is removed first; a live one refuses.
 */
export async function resumeSession(
  deps: LaunchDeps & {
    tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow' | 'killWindow'>;
  },
  id: string,
): Promise<{ record: SessionRecord; from: SessionRecord; warning?: string }> {
  const old = deps.store.get(id);
  if (old.agent === 'terminal')
    throw new MesaError('usage', `session ${id} is a plain terminal; open a new one instead`);
  const agentId = old.backgroundId ?? old.agentSessionId;
  if (!agentId) {
    throw new MesaError(
      'not_found',
      `session ${id} has no agent session id to resume; start a new one with mesa open ${old.project === GENERAL_PROJECT ? '--general' : old.project}`,
    );
  }
  const resumedBy = resumerOf(deps.store, old);
  if (resumedBy) {
    throw new MesaError(
      'usage',
      `session ${id} was already resumed as ${resumedBy}; mesa resume ${resumedBy}`,
    );
  }
  const { agent } = old;
  await readyAgent(deps.run, agent);
  const project = old.project === GENERAL_PROJECT ? null : findProject(deps.profile, old.project);
  // tmux would start a window whose folder is gone in $HOME, where claude has no such conversation.
  const folder = folderOf(old, project);
  if (!existsSync(folder)) {
    throw new MesaError(
      'not_found',
      `session ${id}'s folder ${folder} is gone, and ${old.agent} resumes its conversation only there`,
    );
  }
  requireOwnWorktree(deps.store, old);
  const target = windowOf(old);
  const left = await deps.tmux.findWindow(target);
  if (left && !left.dead) {
    throw new MesaError(
      'usage',
      `session ${id} is still running; mesa attach ${id}, or mesa stop ${id} first`,
    );
  }
  if (left) await killIfThere(deps.tmux, target);
  const { record, warning } = await launchSession(
    deps,
    {
      project,
      agent: old.agent,
      mode: old.mode,
      background: old.background,
      backgroundId: old.backgroundId,
      agentSessionId: old.agentSessionId,
      // The same conversation, so the same goal; it is not typed in again.
      goal: old.goal,
      // Its place in the tree too, and its folder: claude finds the conversation by its cwd.
      parent: old.parent,
      worktree: old.worktree,
      cwd: old.cwd,
      name: old.name,
      adopted: old.adopted,
      vaultMounted: old.vaultMounted,
      resumedFrom: old.id,
    },
    {
      command: (record) => {
        if (old.backgroundId) return claudeBackgroundAttach(old.backgroundId);
        if (agent === 'antigravity')
          return AGENTS.antigravity.resume(
            agentId,
            prepareAntigravityLog(deps.profile.paths.logs, record.id),
            deps.profile.config.agents,
            old.mode,
          );
        return AGENTS[agent].resume(
          agentId,
          folder,
          deps.vaultServer,
          deps.profile.config.agents,
          old.mode,
        );
      },
    },
  );
  // The new session runs now, so marking the old one is best effort: a failure is a warning,
  // never a failed resume that a retry would open twice.
  const at = deps.clock().toISOString();
  try {
    const from = deps.store.update(old.id, (current) => ({
      resumedBy: record.id,
      ...ending(current, at),
    }));
    return { record, from, ...(warning ? { warning } : {}) };
  } catch (error) {
    const why = `session ${id} not marked resumed: ${toFail(error).error.message}`;
    return { record, from: old, warning: joinWarnings(warning, why) };
  }
}
