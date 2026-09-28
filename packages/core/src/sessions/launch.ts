import { existsSync } from 'node:fs';
import { AgentSchema, readyAgent } from '../agents/agents.js';
import { AGENT_NAMES, type Agent } from '../agents/names.js';
import type { Clock } from '../lib/clock.js';
import type { Runner } from '../lib/process.js';
import { MesaError, toFail } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Project, readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import type { RegistryEntry } from '../projects/registry.js';
import { sessionWorktree } from '../worktrees/create.js';
import { windowEnv } from './caller.js';
import { prepareOutputLog } from './output-log.js';
import type { SessionRecord } from './record.js';
import { PROCESS } from './state.js';
import type { SessionStore } from './store.js';
import type { TmuxBackend } from './tmux/backend.js';
import { windowName } from './window-name.js';
import { removeWorktree, type Worktree } from './worktree.js';

// Launching a session, the one sequence every start goes through (open, resume, adopt, handoff,
// and a queued start): its record, its worktree, its folder checked, the project's skills linked
// in, then its window, with its output log; and when the window cannot open, what the launch made
// removed again.

export type LaunchDeps = {
  profile: Profile;
  /** For MESA_PROFILE: a Profile knows its paths, not its name. */
  profileName: string;
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'openWindow'>;
  run: Runner;
  clock: Clock;
  /** Links the project's enabled skills into the folder its agent runs in; throws on failure. */
  syncSkills: (project: string, folder: string) => void;
};

/**
 * The registered project a session starts on, with its mesa.yaml read: a folder that is gone is
 * not_found, never an agent started in $HOME.
 */
export function launchProject(profile: Profile, name: string) {
  const entry = findProject(profile, name);
  return { entry, project: readProjectFile(entry.path) };
}

/**
 * The agent a new session runs, ready to start (readyAgent): `asked`, else the project's, else
 * the profile's default. A name Mesa does not know is agent_unavailable.
 */
export async function launchAgent(
  deps: Pick<LaunchDeps, 'profile' | 'run'>,
  project: Project,
  asked?: string,
) {
  const name = asked ?? project.agent ?? deps.profile.config.defaultAgent;
  const parsed = AgentSchema.safeParse(name);
  if (!parsed.success) {
    const known = AGENT_NAMES.join(', ');
    throw new MesaError('agent_unavailable', `unknown agent ${name}; agents are ${known}`);
  }
  return { agent: parsed.data, spec: await readyAgent(deps.run, parsed.data) };
}

/** Where a session's agent runs: its own folder, else its worktree, else the project's. */
export const folderOf = (r: Pick<SessionRecord, 'cwd' | 'worktree'>, project: RegistryEntry) =>
  r.cwd ?? r.worktree?.path ?? project.path;

/** What a new session's record holds before its window opens. */
type NewLaunch = {
  /** A headless run (CONTEXT.md, Skill run); interactive when unset. */
  kind?: 'run';
  project: RegistryEntry;
  agent: Agent;
  /** None while queued: a session that never ran has no conversation. */
  agentSessionId?: string;
  goal?: string;
  parent?: string;
  /** The session a skill run is about (mesa run --session). */
  about?: string;
  /** Queued after this session (mesa open --after): the record waits, with no window yet. */
  after?: string;
  pending?: SessionRecord['pending'];
  worktree?: Worktree;
  cwd?: string;
  name?: string;
  adopted?: true;
  resumedFrom?: string;
};

/** How a session's agent starts. */
type Start = {
  /** The agent's command line, for the record as it stands when its window opens. */
  command: (record: SessionRecord) => string;
  /** Its own worktree on this branch first (CONTEXT.md, Worktree), from `base` if new. */
  branch?: string;
  base?: string;
};

/**
 * Starts the agent of a session already written: its worktree first when `branch` is asked for
 * and it has none (kept on the record at once, so a start retried after a kill finds it), then
 * its folder checked, the project's enabled skills linked into it (a failure is the warning
 * returned, never an error), and `command` run in its window, whose output goes to the session's
 * output log while the config's `sessions.log` is on. When anything fails, the worktree it made
 * is removed again, and dropped from the record, so a retry can add it again.
 */
export async function startSession(
  deps: LaunchDeps,
  written: SessionRecord,
  project: RegistryEntry,
  start: Start,
): Promise<{ record: SessionRecord; warning?: string }> {
  let record = written;
  let made: Worktree | undefined;
  try {
    if (!record.worktree && start.branch !== undefined) {
      made = await worktreeFor(deps, project, start.branch, start.base);
      record = deps.store.update(record.id, { worktree: made });
    }
    const cwd = agentFolder(record, project);
    const warning = syncSkillsInto(deps, project.name, cwd);
    const { paths, config } = deps.profile;
    await deps.tmux.openWindow({
      project: project.name,
      window: record.tmux.window,
      // claude keys its transcripts by cwd.
      cwd,
      command: start.command(record),
      env: windowEnv(record.id, deps.profileName),
      ...(config.sessions.log ? { log: prepareOutputLog(paths.logs, record.id) } : {}),
    });
    return { record, ...(warning ? { warning } : {}) };
  } catch (error) {
    if (made) {
      await removeWorktree(deps.run, project.path, made);
      deps.store.update(record.id, { worktree: undefined });
    }
    throw error;
  }
}

/**
 * A new session: its record written, then `prepare`d (a handoff's note) and started
 * (startSession). When anything after the write fails, the record is removed again, with what
 * startSession made, and the error rethrown.
 */
export async function launchSession(
  deps: LaunchDeps,
  s: NewLaunch,
  start: Start & { prepare?: (created: SessionRecord) => SessionRecord },
): Promise<{ record: SessionRecord; warning?: string }> {
  const created = createRecord(deps, s);
  try {
    const record = start.prepare ? start.prepare(created) : created;
    return await startSession(deps, record, s.project, start);
  } catch (error) {
    deps.store.remove(created.id);
    throw error;
  }
}

/**
 * The folder a session's agent runs in, which must still be there: not_found when it is gone, as
 * tmux would start the agent in $HOME, and a skills sync would make the folder again.
 */
function agentFolder(record: SessionRecord, project: RegistryEntry) {
  const folder = folderOf(record, project);
  if (!existsSync(folder)) {
    throw new MesaError('not_found', `${folder} is gone: its agent has nowhere to run`);
  }
  return folder;
}

/**
 * Links the project's enabled skills into `folder` before its agent starts there, so it finds
 * them; a failure is the warning returned, never an error.
 */
function syncSkillsInto(deps: Pick<LaunchDeps, 'syncSkills'>, project: string, folder: string) {
  try {
    deps.syncSkills(project, folder);
    return undefined;
  } catch (error) {
    return `skills not synced into ${folder}: ${toFail(error).error.message}`;
  }
}

/** A new worktree on `branch`, unless a session has the worktree there. */
function worktreeFor(deps: LaunchDeps, entry: RegistryEntry, branch: string, base?: string) {
  return sessionWorktree(deps.profile, deps.run, deps.store, entry, branch, base);
}

// ponytail: a guess until Faro (#25) classifies it on the next look: a fresh claude waits at its
// prompt, or at the trust dialog in a folder it has not seen, or works on its goal.
/**
 * A session's state the moment its window opens. A headless run has no prompt to wait at: it
 * works until its agent exits, a process fact.
 */
export const launched = (at: string, kind?: 'run'): SessionRecord['lastState'] =>
  kind === 'run'
    ? { state: 'working', confidence: PROCESS, at, source: 'mesa' }
    : { state: 'idle', confidence: 0.6, at, source: 'mesa' };

/** A session's record, named for the window it gets; with `pending`, queued, with none yet. */
export function createRecord(deps: Pick<LaunchDeps, 'store' | 'clock' | 'profile'>, s: NewLaunch) {
  const now = deps.clock().toISOString();
  return deps.store.create((id) => ({
    kind: s.kind ?? 'interactive',
    project: s.project.name,
    agent: s.agent,
    ...(s.agentSessionId === undefined ? {} : { agentSessionId: s.agentSessionId }),
    ...(s.goal === undefined ? {} : { goal: s.goal }),
    ...(s.parent === undefined ? {} : { parent: s.parent }),
    ...(s.about === undefined ? {} : { about: s.about }),
    ...(s.after === undefined ? {} : { after: s.after }),
    ...(s.pending === undefined ? {} : { pending: s.pending }),
    ...(s.worktree === undefined ? {} : { worktree: s.worktree }),
    ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
    ...(s.name === undefined ? {} : { name: s.name }),
    ...(s.adopted ? { adopted: s.adopted } : {}),
    // Named after the Mesa id, which a resume never reuses, so windows never collide.
    tmux: {
      socket: deps.profile.paths.tmuxSocket,
      session: s.project.name,
      window: windowName(s.agent, id),
    },
    startedAt: now,
    lastState: s.pending
      ? { state: 'queued', confidence: 1, at: now, source: 'mesa' }
      : launched(now, s.kind),
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
}
