import type { Agent } from '../agents/names.js';
import type { Clock } from '../lib/clock.js';
import type { Profile } from '../profile/profile.js';
import type { RegistryEntry } from '../projects/registry.js';
import { GENERAL_PROJECT } from './general.js';
import type { SessionRecord } from './record.js';
import { PROCESS } from './state.js';
import type { SessionStore } from './store.js';
import { windowName } from './window-name.js';
import type { Worktree } from './worktree.js';

// A new session's record: what it holds at creation and the state it starts in.

/** What a new session's record holds before its window opens. */
export type NewLaunch = {
  /** A headless run (CONTEXT.md, Skill run); interactive when unset. */
  kind?: 'run' | 'terminal';
  project: RegistryEntry | null;
  agent: Agent | 'terminal';
  mode?: 'plan';
  background?: true;
  backgroundId?: string;
  /** None while queued: a session that never ran has no conversation. */
  agentSessionId?: string;
  goal?: string;
  automation?: SessionRecord['automation'];
  parent?: string;
  /** The session a skill run is about (mesa run --session). */
  about?: string;
  /** Queued after this session (mesa open --after): the record waits, with no window yet. */
  after?: string;
  pending?: SessionRecord['pending'];
  worktree?: Worktree;
  /** The additional projects' worktrees it takes over (a resume's, a handoff's). */
  additional?: SessionRecord['additional'];
  cwd?: string;
  name?: string;
  adopted?: true;
  /** A background process started with the mount, which a resume attaches to again. */
  vaultMounted?: true;
  resumedFrom?: string;
  /** The imported item it starts from (mesa open --from). */
  from?: SessionRecord['from'];
};

// ponytail: a guess until Faro (#25) classifies it on the next look: a fresh claude waits at its
// prompt, or at the trust dialog in a folder it has not seen, or works on its goal.
/**
 * A session's state the moment its window opens. A headless run has no prompt to wait at: it
 * works until its agent exits, a process fact.
 */
export const launched = (at: string, kind?: 'run' | 'terminal'): SessionRecord['lastState'] =>
  kind === 'run' || kind === 'terminal'
    ? { state: 'working', confidence: PROCESS, at, source: 'mesa' }
    : { state: 'idle', confidence: 0.6, at, source: 'mesa' };

/** A session's record, named for the window it gets; with `pending`, queued, with none yet. */
export function createRecord(
  deps: { store: SessionStore; clock: Clock; profile: Profile },
  s: NewLaunch,
) {
  const now = deps.clock().toISOString();
  return deps.store.create((id) => ({
    kind: s.kind ?? 'interactive',
    project: s.project?.name ?? GENERAL_PROJECT,
    agent: s.agent,
    ...(s.mode ? { mode: s.mode } : {}),
    ...(s.background ? { background: true as const } : {}),
    ...(s.backgroundId ? { backgroundId: s.backgroundId } : {}),
    ...(s.agentSessionId === undefined ? {} : { agentSessionId: s.agentSessionId }),
    ...(s.goal === undefined ? {} : { goal: s.goal }),
    ...(s.automation ? { automation: s.automation } : {}),
    ...(s.parent === undefined ? {} : { parent: s.parent }),
    ...(s.about === undefined ? {} : { about: s.about }),
    ...(s.after === undefined ? {} : { after: s.after }),
    ...(s.pending === undefined ? {} : { pending: s.pending }),
    ...(s.worktree === undefined ? {} : { worktree: s.worktree }),
    ...(s.additional === undefined ? {} : { additional: s.additional }),
    ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
    ...(s.name === undefined ? {} : { name: s.name }),
    ...(s.adopted ? { adopted: s.adopted } : {}),
    ...(s.vaultMounted ? { vaultMounted: s.vaultMounted } : {}),
    ...(s.from === undefined ? {} : { from: s.from }),
    // Named after the Mesa id, which a resume never reuses, so windows never collide.
    tmux: {
      socket: deps.profile.paths.tmuxSocket,
      session: s.project?.name ?? GENERAL_PROJECT,
      window: windowName(s.agent, id),
    },
    startedAt: now,
    lastState: s.pending
      ? { state: 'queued', confidence: 1, at: now, source: 'mesa' }
      : launched(now, s.kind),
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
}
