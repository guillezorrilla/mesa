import { AGENT_NAMES, AgentSchema, readyAgent } from '../agents/agents.js';
import type { IdSource } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import type { Caller } from './caller.js';
import { requireCommandFits } from './goal.js';
import { createRecord, type LaunchDeps, launchProject, launchSession } from './launch.js';
import { isOver, type SessionRecord } from './record.js';

type OpenDeps = LaunchDeps & {
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the default parent. */
  caller: () => Caller;
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
};

/**
 * Starts an agent for a registered project in a new window of the project's tmux session, with
 * `goal` as its first prompt, and with `branch`, in its own git worktree. The record is written
 * first, with the agent session id Mesa chose (docs/spikes/session-ids.md), and removed again,
 * with the worktree, if the window cannot open. With `after` a session that is not over yet, it
 * is only queued: the record, `queued`, with no window, worktree, or agent session id until it
 * starts (startQueued).
 */
export async function openSession(
  deps: OpenDeps,
  input: OpenInput,
): Promise<{ record: SessionRecord; warning?: string }> {
  if (input.base !== undefined && input.branch === undefined) {
    throw new MesaError('usage', '--base needs --branch');
  }
  const waited = input.after === undefined ? undefined : waitedOn(deps, input.after);
  const parent = parentOf(deps, input);
  // Read even when --agent is given.
  const { entry, project } = launchProject(deps.profile, input.project);
  const name = input.agent ?? project.agent ?? deps.profile.config.defaultAgent;
  const parsed = AgentSchema.safeParse(name);
  if (!parsed.success) {
    const known = AGENT_NAMES.join(', ');
    throw new MesaError('agent_unavailable', `unknown agent ${name}; agents are ${known}`);
  }
  const agent = parsed.data;
  const spec = await readyAgent(deps.run, agent);

  const agentSessionId = deps.newUuid();
  const command = spec.start(agentSessionId, input.goal);
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
