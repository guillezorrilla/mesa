import { AGENTS } from '../agents/agents.js';
import { AGENT_NAMES, type Agent } from '../agents/names.js';
import type { Clock } from '../lib/clock.js';
import type { Env, Runner } from '../lib/process.js';

// Agent listings, ADR-0003's second signal: each agent Mesa runs lists its sessions on the
// machine, Mesa's and the owner's alike (Claude Code's live processes: agents/claude/listing.ts;
// Codex's recently written rollouts: agents/codex/listing.ts).

/** One listed agent session, keyed by its agent session id (the listing's `name` changes). */
export type AgentProcess = {
  agent: Agent;
  /** Its process, when the listing names one (Claude Code's does). */
  pid?: number;
  cwd: string;
  agentSessionId: string;
  startedAt: string;
  /**
   * `idle`, `busy`, or `waiting`; kept as the listing says it, so a new status still lists. None
   * from a listing that does not say (Codex's).
   */
  status?: string;
  /** Only while `waiting`: `permission prompt` or `input needed`. */
  waitingFor?: string;
};

/** What the listings read: Claude Code's runs `claude agents`, Codex's reads `$CODEX_HOME`. */
export type ListingDeps = { run: Runner; env: Env; home: string; clock: Clock };

/** Every agent's listed sessions; an agent whose listing fails lists none. */
export async function listAgentProcesses(deps: ListingDeps): Promise<AgentProcess[]> {
  const lists = await Promise.all(
    AGENT_NAMES.map(async (a) => {
      try {
        return await AGENTS[a].listing.list(deps);
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}
