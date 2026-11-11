import { newSessionId, startCommand } from '../../agents/agents.js';
import { requireSessionModel } from '../../agents/launch-flags.js';
import { supportsAgentCapability, supportsPlanStart } from '../../agents/names.js';
import type { IdSource } from '../../lib/ids.js';
import { shellWord } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { reviewDeny } from '../../prs/review-guard.js';
import { worktreeSettings } from '../../worktrees/settings.js';
import { depthOf, MAX_WORKER_DEPTH } from '../record/family.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { isOver } from '../record/lifecycle.js';
import type { SessionRecord } from '../record/record.js';
import type { Caller } from '../window/caller.js';
import { additionalDirs, additionalProjects, plannedAdditional } from './additional.js';
import { briefedGoal, requireCommandFits, requireGoalCommandRuns } from './goal.js';
import { folderOf, type LaunchDeps, launchAgent, launchProject, launchSession } from './launch.js';
import { createRecord } from './new-record.js';
import { type OpenInput, validateOpenInput } from './open-input.js';
import { notedGoal, type SetupBeside, setupLine } from './setup-session.js';
import { goalPreparing, sessionWindowCommand } from './window-command.js';

export type OpenDeps = LaunchDeps & {
  home: string;
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the default parent. */
  caller: () => Caller;
  shell: string;
};

/**
 * The parent a new session gets: `parent` when given (not_found if it is not a session here),
 * none with `noParent`, else the session whose window this runs in (the caller), which queued it,
 * else the session it waits on.
 */
function parentOf(
  deps: Pick<OpenDeps, 'store' | 'caller'>,
  input: { parent?: string; noParent?: boolean; after?: string; worker?: boolean },
): string | undefined {
  if (input.parent !== undefined) {
    const found = deps.store.find(input.parent);
    if (!found) {
      throw new MesaError(
        'not_found',
        `no session ${input.parent} to be the parent; see mesa sessions, or pass --no-parent`,
      );
    }
    // A worker's reports would go to a session that never reads them.
    if (input.worker && isOver(found))
      throw new MesaError(
        'usage',
        `session ${input.parent} has ended; a worker needs a live parent`,
      );
    return input.parent;
  }
  if (input.worker) {
    const caller = deps.caller();
    if (!caller.session)
      throw new MesaError(
        'usage',
        caller.inMesaWindow
          ? "this Mesa window's session is not in this profile; pass --parent <id>"
          : 'mesa worker runs inside a Mesa window; outside one pass --parent <id>',
      );
    return caller.session.id;
  }
  return input.noParent ? undefined : (deps.caller().session?.id ?? input.after);
}

/** Refuses a child of `parent` when workers already nest MAX_WORKER_DEPTH deep there. */
function requireNestingRoom(deps: Pick<OpenDeps, 'store'>, parent: string): void {
  const records = deps.store.readable();
  const found = records.find((r) => r.id === parent);
  const depth = found ? depthOf(records)(found) : 0;
  if (depth >= MAX_WORKER_DEPTH)
    throw new MesaError(
      'usage',
      `${parent} nests workers ${depth} deep; the limit is ${MAX_WORKER_DEPTH}`,
    );
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
    const name = entry?.name ?? GENERAL_PROJECT;
    // In the parent's folder for the project: its own, or its additional worktree there.
    const inherited =
      from && !input.branch && !input.worktree
        ? from.project === name
          ? folderOf(from, entry)
          : from.additional?.find((a) => a.project === name)?.worktree.path
        : undefined;
    const cwd = inherited ?? (input.general ? deps.home : undefined);
    const shell = `exec ${shellWord(deps.shell)} -l`;
    const command = input.run?.trim() ? `${input.run.trim()}; ${shell}` : shell;
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
      {
        command: () => command,
        branch: input.branch,
        base: input.base,
        ...setupBesideFor(deps, entry, input.branch),
      },
    );
  }
  const waited = input.after === undefined ? undefined : waitedOn(deps, input.after);
  const parent = parentOf(deps, input);
  // Briefed by the session that starts it, not one it only waits on.
  const started = input.parent !== undefined || parent !== input.after;
  if (parent && started) requireNestingRoom(deps, parent);
  const { goal, brief } = briefedGoal(input.goal, parent, started);
  // Read even when --agent is given.
  const selected = input.project ? launchProject(deps.profile, input.project) : null;
  const { agent } = await launchAgent(deps, selected?.project, input.agent);
  if (input.mode === 'plan' && !supportsPlanStart(agent)) {
    throw new MesaError('usage', `${agent} has no qualified plan startup mode`);
  }
  if (input.background && !supportsAgentCapability(agent, 'background')) {
    throw new MesaError('usage', `${agent} has no qualified native background mode`);
  }
  requireGoalCommandRuns(goal, agent);
  requireSessionModel(agent, input);
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
  const command = (
    id: string,
    // The record's goal, when given: the launch may add a note of its Setup session to it.
    more: Pick<SessionRecord, 'additional' | 'goal'>,
    disallowed: readonly string[],
  ) =>
    startCommand(
      agent,
      deps.mounts,
      deps.profile.config.agents,
      {
        id,
        logs: deps.profile.paths.logs,
        agentSessionId,
        goal: more.goal ?? goal,
        mode: input.mode === 'plan' ? 'plan' : undefined,
        model: input.model,
        effort: input.effort,
        disallowed,
      },
      additionalDirs(more),
    );
  // A parallel setup's Setup session is named in the goal the agent is given (notedGoal).
  const besideStart = setupBesideFor(deps, selected?.entry, input.branch);
  const given = besideStart.setupBeside ? notedGoal(goal, 'xxxxxxxx') : goal;
  if (!input.background)
    requireCommandFits(
      sessionWindowCommand(
        agent,
        'interactive',
        command('xxxxxxxx', { additional: planned, goal: given }, reviewDeny(agent, input.review)),
        goalPreparing(deps, 'interactive', given),
      ),
    );
  const session = {
    project: selected?.entry ?? null,
    agent,
    ...(input.mode === 'plan' ? { mode: 'plan' as const } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.background ? { background: true as const } : {}),
    goal,
    ...(brief ? { brief: true as const } : {}),
    ...(input.automation ? { automation: input.automation } : {}),
    parent,
    ...(input.general ? { cwd: deps.home } : input.cwd ? { cwd: input.cwd } : {}),
    ...(input.worktree ? { worktree: input.worktree } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(input.review ? { review: input.review } : {}),
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
      command: (record, deny) => command(record.id, record, deny),
      branch: input.branch,
      base: input.base,
      ...besideStart,
      ...(additional
        ? { additional: additional.map((entry) => ({ entry, base: input.base })) }
        : {}),
    },
  );
}

/**
 * How a session on a new `branch` of `entry` opens a Setup session for each new worktree, its own
 * and each additional project's, under `setupWhile: parallel` (Start's setupBeside): a plain
 * terminal, its child, in that project's worktree (the parent's folder there), whose first line
 * runs the setup (setupLine). One for an additional project is named after it. Nothing
 * otherwise, so setup runs first.
 */
export function setupBesideFor(
  deps: OpenDeps,
  entry: RegistryEntry | null | undefined,
  branch: string | undefined,
): { setupBeside?: SetupBeside } {
  if (!entry || branch === undefined) return {};
  if (worktreeSettings(deps.profile, entry).setupWhile !== 'parallel') return {};
  return {
    setupBeside: async (owner, setup, project) => {
      const { record: child } = await openSession(deps, {
        terminal: true,
        project: project.name,
        parent: owner.id,
        run: setupLine(setup, deps.self),
      });
      const name = project.name === entry.name ? 'Setup' : `Setup ${project.name}`;
      deps.store.update(child.id, { name });
      return child.id;
    },
  };
}

/** The session `id` a new one waits on; not_found when there is none. */
function waitedOn(deps: Pick<OpenDeps, 'store'>, id: string) {
  const found = deps.store.find(id);
  if (!found) throw new MesaError('not_found', `no session ${id} to wait on; see mesa sessions`);
  return found;
}
