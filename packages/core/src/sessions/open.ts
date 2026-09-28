import { newSessionId, startCommand } from '../agents/agents.js';
import type { IdSource } from '../lib/ids.js';
import { shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Caller } from './caller.js';
import { requireCommandFits } from './goal.js';
import {
  createRecord,
  type LaunchDeps,
  launchAgent,
  launchProject,
  launchSession,
} from './launch.js';
import { isOver, type SessionRecord } from './record.js';

type OpenDeps = LaunchDeps & {
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
  project: string;
  agent?: string;
  goal?: string;
  parent?: string;
  noParent?: boolean;
  /** Queued until this session is over (CONTEXT.md, Queued session). */
  after?: string;
  /** Its own git worktree on this branch (CONTEXT.md, Worktree), started from `base` if new. */
  branch?: string;
  base?: string;
  /** A shell in the project checkout, with no coding agent or provider conversation. */
  terminal?: boolean;
};

/**
 * Starts an agent for a registered project in a new window of the project's tmux session, with
 * `goal` as its first prompt, and with `branch`, in its own git worktree. The record is written
 * first, with the agent session id Mesa chose (docs/spikes/session-ids.md), or none for an agent
 * that picks its own (codex: a look at the board reads it), and removed again, with the worktree,
 * if the window cannot open. With `after` a session that is not over yet, it is only queued: the
 * record, `queued`, with no window, worktree, or agent session id until it starts (startQueued).
 */
export async function openSession(
  deps: OpenDeps,
  input: OpenInput,
): Promise<{ record: SessionRecord; warning?: string }> {
  if (input.base !== undefined && input.branch === undefined) {
    throw new MesaError('usage', '--base needs --branch');
  }
  if (input.terminal) {
    if (input.agent || input.goal || input.after)
      throw new MesaError('usage', '--terminal cannot use --agent, --goal, or --after');
    const { entry } = launchProject(deps.profile, input.project);
    const command = `exec ${shellWord(deps.shell)} -l`;
    requireCommandFits(command);
    return launchSession(
      deps,
      {
        kind: 'terminal',
        project: entry,
        agent: 'terminal',
        parent: parentOf(deps, input),
        name: 'Terminal',
      },
      { command: () => command, branch: input.branch, base: input.base },
    );
  }
  const waited = input.after === undefined ? undefined : waitedOn(deps, input.after);
  const parent = parentOf(deps, input);
  // Read even when --agent is given.
  const { entry, project } = launchProject(deps.profile, input.project);
  const { agent } = await launchAgent(deps, project, input.agent);

  const agentSessionId = newSessionId(agent, deps.newUuid);
  const command = startCommand(agent, { agentSessionId, goal: input.goal });
  requireCommandFits(command);
  const session = { project: entry, agent, goal: input.goal, parent };
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
    { command: () => command, branch: input.branch, base: input.base },
  );
}

/** The session `id` a new one waits on; not_found when there is none. */
function waitedOn(deps: Pick<OpenDeps, 'store'>, id: string) {
  const found = deps.store.find(id);
  if (!found) throw new MesaError('not_found', `no session ${id} to wait on; see mesa sessions`);
  return found;
}
