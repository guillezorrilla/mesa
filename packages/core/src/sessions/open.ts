import { AGENT_NAMES, AGENTS, AgentSchema } from '../agents.js';
import type { Clock } from '../clock.js';
import { checkAgent } from '../doctor.js';
import type { IdSource } from '../ids.js';
import type { Runner } from '../process.js';
import type { Profile } from '../profile.js';
import { readProjectFile } from '../project-file.js';
import { findProject } from '../projects.js';
import { MesaError } from '../result.js';
import type { SessionRecord, SessionStore } from './store.js';
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
  const now = deps.clock().toISOString();
  const record = deps.store.create((id) => ({
    kind: 'interactive',
    project: entry.name,
    agent,
    agentSessionId,
    // Named after the Mesa id, which a resume never reuses, so windows never collide.
    tmux: { socket: deps.profile.paths.tmuxSocket, session: entry.name, window: `${agent}-${id}` },
    startedAt: now,
    // ponytail: a guess until Faro (#25) classifies it: a fresh claude waits at its prompt, or at
    // the trust dialog in a folder it has not seen.
    lastState: { state: 'idle', confidence: 0.6, at: now, source: 'mesa' },
  }));
  try {
    await deps.tmux.openWindow({
      project: entry.name,
      window: record.tmux.window,
      cwd: entry.path,
      command: spec.start(agentSessionId),
      env: { MESA_SESSION_ID: record.id, MESA_PROFILE: deps.profileName },
    });
  } catch (error) {
    deps.store.remove(record.id);
    throw error;
  }
  return record;
}
