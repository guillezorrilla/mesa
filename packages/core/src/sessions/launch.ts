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
  agentSessionId: string;
  goal?: string;
  parent?: string;
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
    await deps.tmux.openWindow({
      project: s.project.name,
      window: record.tmux.window,
      // claude keys its transcripts by cwd.
      cwd: folderOf(s, s.project),
      command: s.command,
      env: windowEnv(record.id, deps.profileName),
    });
  } catch (error) {
    deps.store.remove(record.id);
    throw error;
  }
  return record;
}

/** A session's record, named for the window it gets (startWindow, or a later resume). */
export function createRecord(deps: Pick<LaunchDeps, 'store' | 'clock' | 'profile'>, s: NewLaunch) {
  const now = deps.clock().toISOString();
  return deps.store.create((id) => ({
    kind: 'interactive',
    project: s.project.name,
    agent: s.agent,
    agentSessionId: s.agentSessionId,
    ...(s.goal === undefined ? {} : { goal: s.goal }),
    ...(s.parent === undefined ? {} : { parent: s.parent }),
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
    // ponytail: a guess until Faro (#25) classifies it on the next look: a fresh claude waits at
    // its prompt, or at the trust dialog in a folder it has not seen, or works on its goal.
    lastState: { state: 'idle', confidence: 0.6, at: now, source: 'mesa' },
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
}
