import { newSessionId, startCommand } from '../../agents/agents.js';
import { supportsAgentCapability, supportsPlanStart } from '../../agents/names.js';
import type { IdSource } from '../../lib/ids.js';
import { shellWord } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { isOver } from '../record/lifecycle.js';
import type { SessionRecord } from '../record/record.js';
import type { Caller } from '../window/caller.js';
import { additionalDirs, additionalProjects, plannedAdditional } from './additional.js';
import { requireCommandFits, requireGoalCommandRuns } from './goal.js';
import { folderOf, type LaunchDeps, launchAgent, launchProject, launchSession } from './launch.js';
import { createRecord } from './new-record.js';
import { type OpenInput, validateOpenInput } from './open-input.js';
import { goalPreparing, sessionWindowCommand } from './window-command.js';

type OpenDeps = LaunchDeps & {
  home: string;
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the default parent. */
  caller: () => Caller;
  shell: string;
};

/**
 * The parent a new session gets: `parent` when given (not_found if it is not a session here),
 * none with `noParent`, else the session it waits on, else the session whose window this runs in
 * (the caller).
 */
function parentOf(
  deps: Pick<OpenDeps, 'store' | 'caller'>,
  input: { parent?: string; noParent?: boolean; after?: string },
): string | undefined {
  if (input.parent !== undefined) {
    if (!deps.store.find(input.parent)) {
      throw new MesaError(
        'not_found',
        `no session ${input.parent} to be the parent; see mesa sessions, or pass --no-parent`,
      );
    }
    return input.parent;
  }
  return input.noParent ? undefined : (input.after ?? deps.caller().session?.id);
}

/**
 * Starts an agent for a registered project in a new window of the project's tmux session, with
 * `goal` as its first prompt, and with `branch`, in its own git worktree. The record is written
 * first, with the agent session id Mesa chose (docs/spikes/session-ids.md), or none for an agent
 * that picks its own (codex: a look at the board reads it), and removed again, with the worktree,
 * if the window cannot open. With `after` a session that is not over yet, it is only queued: the
 * record, `queued`, with no window, worktree, or agent session id until it starts (startQueued),
 * its `with` kept in `pending` for then.
 * With `with`, each of those projects gets its own worktree on `branch` too, which its agent is
 * given as extra folders (CONTEXT.md, Additional project): every one is checked first
 * (additionalProjects), and the command fitted to where each will be, before any is made.
 */
export async function openSession(
  deps: OpenDeps,
  input: OpenInput,
): Promise<{ record: SessionRecord; warning?: string }> {
  // Checked again as resolved: a goal read from its file is --goal, a checked-out worktree is
  // --checkout.
  const { worktree, ...flags } = input;
  validateOpenInput({ ...flags, checkout: worktree?.path });
  const extra = input.with?.length ? input.with : undefined;
  if (input.terminal) {
    const entry = input.project ? launchProject(deps.profile, input.project).entry : null;
    const parent = parentOf(deps, input);
    const from = parent ? deps.store.get(parent) : undefined;
    const cwd =
      !input.branch && !input.worktree && from?.project === (entry?.name ?? GENERAL_PROJECT)
        ? folderOf(from, entry)
        : input.general
          ? deps.home
          : undefined;
    const command = `exec ${shellWord(deps.shell)} -l`;
    requireCommandFits(command);
    return launchSession(
      deps,
      {
        kind: 'terminal',
        project: entry,
        ...(cwd ? { cwd } : {}),
        agent: 'terminal',
        parent,
        name: 'Terminal',
        ...(input.worktree ? { worktree: input.worktree } : {}),
      },
      { command: () => command, branch: input.branch, base: input.base },
    );
  }
  const waited = input.after === undefined ? undefined : waitedOn(deps, input.after);
  const parent = parentOf(deps, input);
  // Read even when --agent is given.
  const selected = input.project ? launchProject(deps.profile, input.project) : null;
  const { agent } = await launchAgent(deps, selected?.project, input.agent);
  if (input.mode === 'plan' && !supportsPlanStart(agent)) {
    throw new MesaError('usage', `${agent} has no qualified plan startup mode`);
  }
  if (input.background && !supportsAgentCapability(agent, 'background')) {
    throw new MesaError('usage', `${agent} has no qualified native background mode`);
  }
  requireGoalCommandRuns(input.goal, agent);
  if (extra && !supportsAgentCapability(agent, 'addDir')) {
    throw new MesaError('usage', `${agent} has no qualified way to add a folder, so no --with`);
  }
  // Every --with checked before the first git write, and the command fitted to where each goes.
  const additional =
    extra && selected ? await additionalProjects(deps, selected.entry, extra) : undefined;
  const planned =
    additional && input.branch !== undefined
      ? plannedAdditional(deps.profile, additional, input.branch)
      : undefined;

  const agentSessionId = input.background ? undefined : newSessionId(agent, deps.newUuid);
  const command = (id: string, more: Pick<SessionRecord, 'additional'>) =>
    startCommand(
      agent,
      deps.mounts,
      deps.profile.config.agents,
      {
        id,
        logs: deps.profile.paths.logs,
        agentSessionId,
        goal: input.goal,
        mode: input.mode === 'plan' ? 'plan' : undefined,
      },
      additionalDirs(more),
    );
  if (!input.background)
    requireCommandFits(
      sessionWindowCommand(
        agent,
        'interactive',
        command('xxxxxxxx', { additional: planned }),
        goalPreparing(deps, 'interactive', input.goal),
      ),
    );
  const session = {
    project: selected?.entry ?? null,
    agent,
    ...(input.mode === 'plan' ? { mode: 'plan' as const } : {}),
    ...(input.background ? { background: true as const } : {}),
    goal: input.goal,
    ...(input.automation ? { automation: input.automation } : {}),
    parent,
    ...(input.general ? { cwd: deps.home } : {}),
    ...(input.worktree ? { worktree: input.worktree } : {}),
    ...(input.from ? { from: input.from } : {}),
  };
  if (waited && !isOver(waited)) {
    const { branch, base } = input;
    const pending = {
      ...(branch === undefined ? {} : { branch }),
      ...(base === undefined ? {} : { base }),
      ...(extra ? { with: [...extra] } : {}),
    };
    return { record: createRecord(deps, { ...session, after: waited.id, pending }) };
  }
  return launchSession(
    deps,
    { ...session, ...(waited ? { after: waited.id } : {}), agentSessionId },
    {
      command: (record) => command(record.id, record),
      branch: input.branch,
      base: input.base,
      ...(additional
        ? { additional: additional.map((entry) => ({ entry, base: input.base })) }
        : {}),
    },
  );
}

/** The session `id` a new one waits on; not_found when there is none. */
function waitedOn(deps: Pick<OpenDeps, 'store'>, id: string) {
  const found = deps.store.find(id);
  if (!found) throw new MesaError('not_found', `no session ${id} to wait on; see mesa sessions`);
  return found;
}
