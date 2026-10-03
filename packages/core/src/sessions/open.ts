import { newSessionId, startCommand } from '../agents/agents.js';
import { supportsAgentCapability, supportsPlanStart } from '../agents/names.js';
import type { IdSource } from '../lib/ids.js';
import { shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { additionalProjects, plannedAdditional } from './additional.js';
import type { Caller } from './caller.js';
import { GENERAL_PROJECT } from './general.js';
import { requireCommandFits, requireGoalCommandRuns } from './goal.js';
import {
  createRecord,
  folderOf,
  type LaunchDeps,
  launchAgent,
  launchProject,
  launchSession,
  sessionWindowCommand,
} from './launch.js';
import { isOver, type SessionRecord } from './record.js';
import type { Worktree } from './worktree.js';

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
  if (input.noParent && input.parent !== undefined) {
    throw new MesaError('usage', 'pass --parent or --no-parent, not both');
  }
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

/** What `mesa open` asks for, the goal already read (readGoal). */
export type OpenInput = {
  project?: string;
  general?: boolean;
  agent?: string;
  mode?: string;
  /** Keep a Claude session running when its terminal view closes. */
  background?: boolean;
  goal?: string;
  automation?: SessionRecord['automation'];
  parent?: string;
  noParent?: boolean;
  /** Queued until this session is over (CONTEXT.md, Queued session). */
  after?: string;
  /** Its own git worktree on this branch (CONTEXT.md, Worktree), started from `base` if new. */
  branch?: string;
  base?: string;
  /** A shell in the project checkout, with no coding agent or provider conversation. */
  terminal?: boolean;
  /** An existing linked worktree it runs in (checkoutWorktree), in place of `branch`. */
  worktree?: Worktree;
  /** The imported item it starts from (mesa open --from), kept on the record. */
  from?: SessionRecord['from'];
  /**
   * Its additional projects (CONTEXT.md, Additional project), each in its own worktree on
   * `branch`, which the caller names when none is asked for.
   */
  with?: readonly string[];
};

/**
 * Starts an agent for a registered project in a new window of the project's tmux session, with
 * `goal` as its first prompt, and with `branch`, in its own git worktree. The record is written
 * first, with the agent session id Mesa chose (docs/spikes/session-ids.md), or none for an agent
 * that picks its own (codex: a look at the board reads it), and removed again, with the worktree,
 * if the window cannot open. With `after` a session that is not over yet, it is only queued: the
 * record, `queued`, with no window, worktree, or agent session id until it starts (startQueued).
 * With `with`, each of those projects gets its own worktree on `branch` too, which its agent is
 * given as extra folders (CONTEXT.md, Additional project): every one is checked first
 * (additionalProjects), and the command fitted to where each will be, before any is made.
 */
export async function openSession(
  deps: OpenDeps,
  input: OpenInput,
): Promise<{ record: SessionRecord; warning?: string }> {
  if (Boolean(input.project) === Boolean(input.general)) {
    throw new MesaError('usage', 'pass a project or --general, not both');
  }
  const extra = input.with?.length ? input.with : undefined;
  if (extra && (input.general || input.terminal || input.after !== undefined)) {
    throw new MesaError(
      'usage',
      '--with cannot use --general, --terminal, or --after: a session across projects starts at once, with an agent',
    );
  }
  if (extra && input.branch === undefined) {
    throw new MesaError('usage', '--with needs --branch or --worktree');
  }
  if (input.general && (input.branch || input.base || input.after)) {
    throw new MesaError('usage', 'General sessions cannot use --branch, --base, or --after');
  }
  if (input.base !== undefined && input.branch === undefined) {
    throw new MesaError('usage', '--base needs --branch');
  }
  if (input.mode !== undefined && input.mode !== 'plan') {
    throw new MesaError('usage', `unknown session mode ${input.mode}; use plan`);
  }
  if (input.terminal) {
    if (input.agent || input.goal || input.after || input.mode || input.background)
      throw new MesaError(
        'usage',
        '--terminal cannot use --agent, --goal, --after, --mode, or --background',
      );
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
  const command = (id: string, more?: SessionRecord['additional']) =>
    startCommand(agent, deps.vaultServer, deps.profile.config.agents, {
      id,
      logs: deps.profile.paths.logs,
      agentSessionId,
      goal: input.goal,
      mode: input.mode === 'plan' ? 'plan' : undefined,
      additional: more,
    });
  if (!input.background)
    requireCommandFits(sessionWindowCommand(agent, 'interactive', command('xxxxxxxx', planned)));
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
    };
    return { record: createRecord(deps, { ...session, after: waited.id, pending }) };
  }
  return launchSession(
    deps,
    { ...session, ...(waited ? { after: waited.id } : {}), agentSessionId },
    {
      command: (record) => command(record.id, record.additional),
      branch: input.branch,
      base: input.base,
      ...(additional ? { additional } : {}),
    },
  );
}

/** The session `id` a new one waits on; not_found when there is none. */
function waitedOn(deps: Pick<OpenDeps, 'store'>, id: string) {
  const found = deps.store.find(id);
  if (!found) throw new MesaError('not_found', `no session ${id} to wait on; see mesa sessions`);
  return found;
}
