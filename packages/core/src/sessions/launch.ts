import type { Agent } from '../agents/agents.js';
import type { Clock } from '../lib/clock.js';
import type { Profile } from '../profile/profile.js';
import type { RegistryEntry } from '../projects/registry.js';
import { windowEnv } from './caller.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import type { TmuxBackend } from './tmux/backend.js';
import { windowName } from './window-name.js';
import type { Worktree } from './worktree.js';

// Launching a session: its record, then its window. Open, resume, and adopt all launch this way.

export type LaunchDeps = {
  profile: Profile;
  /** For MESA_PROFILE: a Profile knows its paths, not its name. */
  profileName: string;
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'openWindow'>;
  clock: Clock;
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

/** Writes the record, then opens its window; a window that cannot open removes the record again. */
export async function launchSession(
  deps: LaunchDeps,
  s: NewLaunch & { command: string },
): Promise<SessionRecord> {
  const record = createRecord(deps, s);
  try {
    await openWindowOf(deps, record, s.project, s.command);
  } catch (error) {
    deps.store.remove(record.id);
    throw error;
  }
  return record;
}

/** Opens the window a record is named for, running `command` in its folder. */
export const openWindowOf = (
  deps: Pick<LaunchDeps, 'tmux' | 'profileName'>,
  record: SessionRecord,
  project: RegistryEntry,
  command: string,
) =>
  deps.tmux.openWindow({
    project: project.name,
    window: record.tmux.window,
    // claude keys its transcripts by cwd.
    cwd: folderOf(record, project),
    command,
    env: windowEnv(record.id, deps.profileName),
  });

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
