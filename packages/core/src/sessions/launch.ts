import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent } from '../agents/agents.js';
import type { Clock } from '../lib/clock.js';
import type { Runner } from '../lib/process.js';
import { MesaError, toFail } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { RegistryEntry } from '../projects/registry.js';
import { windowEnv } from './caller.js';
import { worktreeHolder } from './holders.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import type { TmuxBackend } from './tmux/backend.js';
import { windowName } from './window-name.js';
import { addWorktree, removeWorktree, type Worktree, worktreePath } from './worktree.js';

// Launching a session, the one sequence every start goes through (open, resume, adopt, handoff,
// and a queued start): its record, its worktree, its folder checked, the project's skills linked
// in, then its window; and when the window cannot open, what the launch made removed again.

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

/** Where a session's agent runs: its own folder, else its worktree, else the project's. */
export const folderOf = (r: Pick<SessionRecord, 'cwd' | 'worktree'>, project: RegistryEntry) =>
  r.cwd ?? r.worktree?.path ?? project.path;

/** What a new session's record holds before its window opens. */
type NewLaunch = {
  project: RegistryEntry;
  agent: Agent;
  /** None while queued: a session that never ran has no conversation. */
  agentSessionId?: string;
  goal?: string;
  parent?: string;
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
 * returned, never an error), and `command` run in its window. When anything fails, the worktree
 * it made is removed again, and dropped from the record, so a retry can add it again.
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
    await deps.tmux.openWindow({
      project: project.name,
      window: record.tmux.window,
      // claude keys its transcripts by cwd.
      cwd,
      command: start.command(record),
      env: windowEnv(record.id, deps.profileName),
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
  const root = join(deps.profile.paths.worktrees, entry.name);
  const path = worktreePath(root, branch);
  const holder = worktreeHolder(deps.store, path);
  if (holder?.worktree && existsSync(path)) {
    throw new MesaError(
      'usage',
      `session ${holder.id} has ${holder.worktree.branch}'s worktree at ${path}: use that session, or pick another branch`,
    );
  }
  return addWorktree(deps.run, { repo: entry.path, root, branch, base });
}

// ponytail: a guess until Faro (#25) classifies it on the next look: a fresh claude waits at its
// prompt, or at the trust dialog in a folder it has not seen, or works on its goal.
/** A session's state the moment its window opens. */
export const launched = (at: string): SessionRecord['lastState'] => ({
  state: 'idle',
  confidence: 0.6,
  at,
  source: 'mesa',
});

/** A session's record, named for the window it gets; with `pending`, queued, with none yet. */
export function createRecord(deps: Pick<LaunchDeps, 'store' | 'clock' | 'profile'>, s: NewLaunch) {
  const now = deps.clock().toISOString();
  return deps.store.create((id) => ({
    kind: 'interactive',
    project: s.project.name,
    agent: s.agent,
    ...(s.agentSessionId === undefined ? {} : { agentSessionId: s.agentSessionId }),
    ...(s.goal === undefined ? {} : { goal: s.goal }),
    ...(s.parent === undefined ? {} : { parent: s.parent }),
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
      : launched(now),
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
}
