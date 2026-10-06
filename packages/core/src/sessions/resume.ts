import { existsSync } from 'node:fs';
import { AGENTS } from '../agents/agents.js';
import { prepareAntigravityLog } from '../agents/antigravity/log.js';
import { claudeBackgroundAttach } from '../agents/claude/background.js';
import { readyAgent } from '../doctor/probe.js';
import { MesaError, toFail } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { joinWarnings } from '../receipts/recorder.js';
import { additionalDirs } from './additional.js';
import { GENERAL_PROJECT } from './general.js';
import { requireOwnWorktree, resumerOf } from './holders.js';
import { folderOf, type LaunchDeps, launchSession } from './launch.js';
import { ending, type SessionRecord } from './record.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';

/**
 * Reopens a session's agent conversation (`claude --resume`, `codex resume`) in its folder, with
 * its additional projects' worktrees (launchSession refuses one that is gone), in a new window,
 * as a new record
 * linked both ways: `resumedFrom` on the new one, `resumedBy` and `endedAt` on the old one. A
 * dead window the old session left is removed first; a live one refuses. The old record is
 * claimed (`resumedBy`) under its lock as soon as the new one exists, before its window starts,
 * so of two resumes at once one starts and the other is refused; a start that fails gives the
 * claim back.
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
  if (resumedBy) throw alreadyResumed(id, resumedBy);
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
  let claimed: string | undefined;
  const claim = (created: SessionRecord) => {
    deps.store.update(old.id, (current) => {
      if (current.resumedBy) throw alreadyResumed(id, current.resumedBy);
      return { resumedBy: created.id };
    });
    claimed = created.id;
    return created;
  };
  const launched = launchSession(
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
      additional: old.additional,
      cwd: old.cwd,
      name: old.name,
      adopted: old.adopted,
      vaultMounted: old.vaultMounted,
      from: old.from,
      resumedFrom: old.id,
    },
    {
      prepare: claim,
      command: (record) => {
        if (old.backgroundId) return claudeBackgroundAttach(old.backgroundId);
        if (agent === 'antigravity')
          return AGENTS.antigravity.resume(
            agentId,
            prepareAntigravityLog(deps.profile.paths.logs, record.id),
            deps.profile.config.agents,
            old.mode,
            additionalDirs(old),
          );
        return AGENTS[agent].resume(
          agentId,
          folder,
          deps.vaultServer,
          deps.profile.config.agents,
          old.mode,
          additionalDirs(old),
        );
      },
    },
  ).catch((error) => {
    try {
      if (claimed)
        deps.store.update(old.id, (current) =>
          current.resumedBy === claimed ? { resumedBy: undefined } : {},
        );
    } catch {
      // The start's own error says more; a claim left names a session that is gone.
    }
    throw error;
  });
  const { record, warning } = await launched;
  // The new session runs now and holds the claim, so ending the old one is best effort: a failure
  // is a warning, never a failed resume.
  const at = deps.clock().toISOString();
  try {
    const from = deps.store.update(old.id, (current) => ending(current, at));
    return { record, from, ...(warning ? { warning } : {}) };
  } catch (error) {
    const why = `session ${id} not marked ended: ${toFail(error).error.message}`;
    return { record, from: old, warning: joinWarnings(warning, why) };
  }
}

const alreadyResumed = (id: string, by: string) =>
  new MesaError('usage', `session ${id} was already resumed as ${by}; mesa resume ${by}`);
