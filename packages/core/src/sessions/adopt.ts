import { AGENTS } from '../agents/agents.js';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptCwd } from '../agents/claude/transcripts.js';
import { codexHome, codexSessions } from '../agents/codex/paths.js';
import { threadForId } from '../agents/codex/rollouts.js';
import { AGENT_LABELS } from '../agents/names.js';
import { readyAgent } from '../doctor/probe.js';
import { MesaError } from '../lib/result.js';
import { findProject, projectOf } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { AgentProcess } from './agent-listing.js';
import { agentSessionHolder } from './holders.js';
import { ADOPTION_WARNING } from './labels.js';
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
 * transcript, unless the caller found it already: `ran`), as an adopted session of the project its
 * folder is in (else `project`), named `name`, else as its agent names it (unless the caller read
 * that already: `name` null), and, unless `noResume`, reopens its conversation in a Mesa window, in
 * that folder. The warning is always the same: the original terminal still holds the conversation.
 */
export async function adoptSession(
  deps: AdoptDeps,
  input: {
    agentSessionId: string;
    project?: string;
    /** Its name; null when the caller read its native name and it has none. */
    name?: string | null;
    noResume?: boolean;
    ran?: NativeOrigin;
  },
): Promise<{ record: SessionRecord; warning: string }> {
  const id = input.agentSessionId;
  if (!UUID.test(id)) {
    throw new MesaError('usage', `${id} is not a native session id (a lowercase UUID)`);
  }
  const given = typeof input.name === 'string' ? sessionName(input.name) : undefined;
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
  const ran = live ?? input.ran ?? nativeConversation(deps, id);
  if (ran === undefined) {
    const agents = ADOPTS.map((a) => AGENT_LABELS[a]).join(' or ');
    const dirs = [
      claudeTranscripts(deps.home, deps.env),
      codexSessions(codexHome(deps.home, deps.env)),
    ].join(', ');
    throw new MesaError('not_found', `no ${agents} session ${id}, live or in ${dirs}`);
  }
  const { agent, cwd } = ran;
  // The name given, else the one the agent shows (native-name.ts) unless read already, else none.
  const named =
    given !== undefined
      ? { name: given }
      : input.name === null
        ? {}
        : withName(deps, { agent, id });
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

/** Where a native conversation ran: its agent and folder. */
export type NativeOrigin = { agent: (typeof ADOPTS)[number]; cwd: string };

/**
 * The agent whose transcripts hold conversation `id`, and the folder it ran in; none for an id
 * that is not a native session id or is on disk nowhere.
 */
export function nativeConversation(
  deps: { home: string; env: LaunchDeps['env'] },
  id: string,
): NativeOrigin | undefined {
  if (!UUID.test(id)) return undefined;
  const cwd = transcriptCwd(claudeTranscripts(deps.home, deps.env), id);
  if (cwd !== undefined) return { agent: 'claude', cwd };
  const thread = threadForId(deps, id);
  return thread && { agent: 'codex', cwd: thread.cwd };
}
