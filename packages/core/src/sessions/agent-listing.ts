import { AGENTS, RUNNABLE_AGENTS, type RunnableName } from '../agents/agents.js';
import type { Runner } from '../lib/process.js';

// Agent listings, ADR-0003's second signal: each agent Mesa runs lists its live sessions on the
// machine, Mesa's and the owner's alike (Claude Code's: agents/claude/listing.ts).

/** One live agent process, keyed by its agent session id (the listing's `name` changes). */
export type AgentProcess = {
  agent: RunnableName;
  pid: number;
  cwd: string;
  agentSessionId: string;
  startedAt: string;
  /** `idle`, `busy`, or `waiting`; kept as the listing says it, so a new status still lists. */
  status: string;
  /** Only while `waiting`: `permission prompt` or `input needed`. */
  waitingFor?: string;
};

/** Every agent's live processes; an agent whose listing fails lists none. */
export async function listAgentProcesses(run: Runner): Promise<AgentProcess[]> {
  const lists = await Promise.all(RUNNABLE_AGENTS.map((a) => AGENTS[a].listing.list(run)));
  return lists.flat();
}
