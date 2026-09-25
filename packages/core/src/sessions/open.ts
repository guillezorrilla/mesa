import { AGENT_NAMES, AGENTS, type Agent, AgentSchema } from '../agents.js';
import type { Clock } from '../clock.js';
import { checkAgent } from '../doctor.js';
import type { IdSource } from '../ids.js';
import type { Runner } from '../process.js';
import type { Profile } from '../profile.js';
import { readProjectFile } from '../project-file.js';
import { findProject } from '../projects.js';
import type { RegistryEntry } from '../registry.js';
import { MesaError } from '../result.js';
import { ending, type SessionRecord, type SessionStore, windowOf } from './store.js';
import type { TmuxBackend } from './tmux.js';

export type OpenDeps = {
  profile: Profile;
  /** For MESA_PROFILE: a Profile knows its paths, not its name. */
  profileName: string;
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'openWindow'>;
  run: Runner;
  clock: Clock;
  newUuid: IdSource;
};

/**
 * Starts an agent for a registered project in a new window of the project's tmux session. The
 * record is written first, with the agent session id Mesa chose (docs/spikes/session-ids.md), and
 * removed again if the window cannot open.
 */
export async function openSession(
  deps: OpenDeps,
  input: { project: string; agent?: string },
): Promise<SessionRecord> {
  const entry = findProject(deps.profile, input.project);
  // Read even when --agent is given: a folder that is gone is not_found, never a claude in $HOME.
  const project = readProjectFile(entry.path);
  const name = input.agent ?? project.agent ?? deps.profile.config.defaultAgent;
  const parsed = AgentSchema.safeParse(name);
  if (!parsed.success) {
    const known = AGENT_NAMES.join(', ');
    throw new MesaError('agent_unavailable', `unknown agent ${name}; agents are ${known}`);
  }
  const agent = parsed.data;
  const spec = AGENTS[agent];
  if (!('start' in spec)) throw new MesaError('agent_unavailable', spec.planned);
  const check = await checkAgent(deps.run, agent);
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);

  const agentSessionId = deps.newUuid();
  return startWindow(deps, {
    project: entry,
    agent,
    agentSessionId,
    command: spec.start(agentSessionId),
  });
}

/**
 * Reopens a session's agent conversation (`claude --resume`) in a new window, as a new record
 * linked both ways: `resumedFrom` on the new one, `resumedBy` and `endedAt` on the old one. A
 * dead window the old session left is removed first; a live one refuses.
 */
export async function resumeSession(
  deps: OpenDeps & { tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow' | 'killWindow'> },
  id: string,
): Promise<{ record: SessionRecord; from: SessionRecord }> {
  const old = deps.store.get(id);
  if (!old.agentSessionId) {
    throw new MesaError(
      'not_found',
      `session ${id} has no agent session id to resume; start a new one with mesa open ${old.project}`,
    );
  }
  if (old.resumedBy) {
    throw new MesaError(
      'usage',
      `session ${id} was already resumed as ${old.resumedBy}; mesa resume ${old.resumedBy}`,
    );
  }
  const spec = AGENTS[old.agent];
  if (!('resume' in spec)) throw new MesaError('agent_unavailable', spec.planned);
  const check = await checkAgent(deps.run, old.agent);
  if (!check.ok) throw new MesaError('agent_unavailable', `${old.agent} ${check.hint}`);
  const target = windowOf(old);
  const left = await deps.tmux.findWindow(target);
  if (left && !left.dead) {
    throw new MesaError(
      'usage',
      `session ${id} is still running; mesa attach ${id}, or mesa stop ${id} first`,
    );
  }
  if (left) await deps.tmux.killWindow(target);
  const record = await startWindow(deps, {
    project: findProject(deps.profile, old.project),
    agent: old.agent,
    agentSessionId: old.agentSessionId,
    command: spec.resume(old.agentSessionId),
    resumedFrom: old.id,
  });
  const from = deps.store.update(old.id, {
    resumedBy: record.id,
    ...ending(old, deps.clock().toISOString()),
  });
  return { record, from };
}

/** Writes the record, then opens its window; a window that cannot open removes the record again. */
async function startWindow(
  deps: OpenDeps,
  s: {
    project: RegistryEntry;
    agent: Agent;
    agentSessionId: string;
    command: string;
    resumedFrom?: string;
  },
): Promise<SessionRecord> {
  const now = deps.clock().toISOString();
  const record = deps.store.create((id) => ({
    kind: 'interactive',
    project: s.project.name,
    agent: s.agent,
    agentSessionId: s.agentSessionId,
    // Named after the Mesa id, which a resume never reuses, so windows never collide.
    tmux: {
      socket: deps.profile.paths.tmuxSocket,
      session: s.project.name,
      window: `${s.agent}-${id}`,
    },
    startedAt: now,
    // ponytail: a guess until Faro (#25) classifies it: a fresh claude waits at its prompt, or at
    // the trust dialog in a folder it has not seen.
    lastState: { state: 'idle', confidence: 0.6, at: now, source: 'mesa' },
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
  try {
    await deps.tmux.openWindow({
      project: s.project.name,
      window: record.tmux.window,
      // The project's registered folder, where open ran it: claude keys its transcripts by cwd.
      cwd: s.project.path,
      command: s.command,
      // COLORTERM: the agent draws its real palette in the app's terminal (SP-3).
      env: { MESA_SESSION_ID: record.id, MESA_PROFILE: deps.profileName, COLORTERM: 'truecolor' },
    });
  } catch (error) {
    deps.store.remove(record.id);
    throw error;
  }
  return record;
}
