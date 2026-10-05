import { AGENTS, readyAgent } from '../agents/agents.js';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptCwd } from '../agents/claude/transcripts.js';
import { codexHome, codexSessions } from '../agents/codex/paths.js';
import { threadForId } from '../agents/codex/rollouts.js';
import { AGENT_LABELS } from '../agents/names.js';
import { ADOPTION_WARNING } from '../display.js';
import { MesaError } from '../lib/result.js';
import { findProject, projectOf } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { AgentProcess } from './agent-listing.js';
import { agentSessionHolder } from './holders.js';
import { type LaunchDeps, launchSession } from './launch.js';
import { withName } from './native-name.js';
import { createRecord } from './new-record.js';
import type { SessionRecord } from './record.js';
import { sessionName } from './rename.js';

// Adopting a native conversation Mesa did not start (CONTEXT.md, Adopted session).

export type AdoptDeps = LaunchDeps & {
  /** The live agent sessions (listAgentProcesses). */
  listing: () => Promise<AgentProcess[]>;
  /** Agent session ids other profiles' records hold. */
  elsewhere: () => ReadonlySet<string>;
  home: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Native conversation sources verified for import; Antigravity has no qualified history source. */
const ADOPTS = ['claude', 'codex'] as const;
const adoptable = (p: AgentProcess): p is AgentProcess & { agent: (typeof ADOPTS)[number] } =>
  ADOPTS.some((agent) => agent === p.agent);

/**
 * Records a native session Mesa did not start, found live (the listing) or on disk (its
 * transcript), as an adopted session of the project its folder is in (else `project`), named
 * `name`, else as its agent names it, and, unless `noResume`, reopens its conversation in a Mesa
 * window, in that folder. The warning is always the same: the original terminal still holds the
 * conversation.
 */
export async function adoptSession(
  deps: AdoptDeps,
  input: { agentSessionId: string; project?: string; name?: string; noResume?: boolean },
): Promise<{ record: SessionRecord; warning: string }> {
  const id = input.agentSessionId;
  if (!UUID.test(id)) {
    throw new MesaError('usage', `${id} is not a native session id (a lowercase UUID)`);
  }
  const given = input.name === undefined ? undefined : sessionName(input.name);
  const held = agentSessionHolder(deps.store, id);
  if (held) throw new MesaError('usage', `Mesa has ${id} already, as session ${held.id}`);
  if (deps.elsewhere().has(id)) {
    throw new MesaError('usage', `another profile's session has ${id} already`);
  }
  const live = (await deps.listing()).find((p) => p.agentSessionId === id);
  if (live && !adoptable(live)) {
    const adopts = ADOPTS.map((a) => AGENT_LABELS[a]).join(' and ');
    throw new MesaError(
      'usage',
      `${id} is a ${AGENT_LABELS[live.agent]} session; Mesa adopts ${adopts} sessions`,
    );
  }
  const ran = live ?? onDisk(deps.home, deps.env, id);
  if (ran === undefined) {
    const agents = ADOPTS.map((a) => AGENT_LABELS[a]).join(' or ');
    const dirs = [claudeTranscripts(deps.home), codexSessions(codexHome(deps.env, deps.home))].join(
      ', ',
    );
    throw new MesaError('not_found', `no ${agents} session ${id}, live or in ${dirs}`);
  }
  const { agent, cwd } = ran;
  // The name given, else the one the agent shows (native-name.ts), else none.
  const named = given === undefined ? withName(deps, { agent, id }) : { name: given };
  const found = projectOf(cwd, readRegistry(deps.profile.paths.registry));
  if (found && input.project !== undefined && input.project !== found) {
    throw new MesaError(
      'usage',
      `session ${id} ran in ${cwd}, in project ${found}: drop --project, or pass --project ${found}`,
    );
  }
  const name = found ?? input.project;
  if (name === undefined) {
    throw new MesaError(
      'not_found',
      `no registered project holds ${cwd}: register it, or pass --project`,
    );
  }
  const project = findProject(deps.profile, name);
  const s = {
    project,
    agent,
    agentSessionId: id,
    adopted: true as const,
    // Resume in the conversation's actual folder, when it is not the project's root.
    ...(cwd === project.path ? {} : { cwd }),
    ...named,
  };
  if (input.noResume) return { record: createRecord(deps, s), warning: ADOPTION_WARNING };
  await readyAgent(deps.run, agent);
  const command = () => AGENTS[agent].resume(id, cwd, deps.vaultServer, deps.profile.config.agents);
  const { record, warning } = await launchSession(deps, s, { command });
  return { record, warning: joinWarnings(ADOPTION_WARNING, warning) ?? ADOPTION_WARNING };
}

/** The agent whose transcripts hold conversation `id`, and the folder it ran in. */
function onDisk(home: string, env: LaunchDeps['env'], id: string) {
  const cwd = transcriptCwd(claudeTranscripts(home), id);
  if (cwd !== undefined) return { agent: 'claude' as const, cwd };
  const thread = threadForId({ home, env }, id);
  return thread && { agent: 'codex' as const, cwd: thread.cwd };
}
