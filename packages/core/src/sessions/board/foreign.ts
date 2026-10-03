import { AGENTS } from '../../agents/agents.js';
import { projectOf } from '../../projects/projects.js';
import type { RegistryEntry } from '../../projects/registry.js';
import type { AgentProcess } from '../agent-listing.js';
import { foreignId } from '../record.js';
import { classifySession } from '../state.js';
import { type ForeignRow, secondsBetween } from './rows.js';

/**
 * A foreign session's board row: its project from its folder, its state from the listing alone.
 * A listing that gives no state (Codex's names only what was written lately) leaves a guess at
 * `working`, 0.5, as for a status a listing has never shown (ADR-0003).
 */
export async function foreignRow(
  deps: {
    projects: readonly RegistryEntry[];
    priorityOf: (project: string | null) => number;
    faro: Parameters<typeof classifySession>[0];
  },
  process: AgentProcess,
  now: Date,
): Promise<ForeignRow> {
  const { faro } = deps;
  const { status, waitingFor: _, ...p } = process;
  const project = projectOf(p.cwd, deps.projects);
  // ponytail: no record, so each look starts its state now and a foreign wait never climbs;
  // keep a first-seen time per pid if foreign sessions need to rank by how long they wait.
  const listed = AGENTS[process.agent].listing.state(process) ?? {
    state: 'working' as const,
    confidence: 0.5,
  };
  const last = { ...listed, at: now.toISOString(), source: 'listing' as const };
  const classified = await classifySession(faro, {
    now: now.toISOString(),
    agent: p.agent,
    last,
    ended: false,
    listed: process,
    priority: deps.priorityOf(project),
  });
  return {
    ...p,
    ...classified,
    id: foreignId(p),
    managed: false,
    project,
    alive: true,
    ...(status === undefined ? {} : { agentStatus: status }),
    runningSeconds: secondsBetween(p.startedAt, now.getTime()),
  };
}
