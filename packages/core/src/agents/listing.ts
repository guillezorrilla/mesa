import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../lib/atomic-file.js';
import type { Clock } from '../lib/clock.js';
import { readJson } from '../lib/json-file.js';
import type { Env, Runner } from '../lib/process.js';
import { AGENTS } from './agents.js';
import { AGENT_NAMES, type Agent } from './names.js';

// Agent listings, ADR-0003's second signal: each agent Mesa runs lists its sessions on the
// machine, Mesa's and the owner's alike (Claude Code's process list: claude/listing.ts;
// Codex's recently written rollouts: codex/listing.ts).

/** One listed agent session, keyed by its agent session id (the listing's `name` changes). */
export type AgentProcess = {
  agent: Agent;
  /** Its process, when the listing names one (Claude Code's does). */
  pid?: number;
  cwd: string;
  agentSessionId: string;
  /** The name a person gave it in its agent (Claude Code's /rename), when there is one. */
  name?: string;
  /** Claude's short background handle, when this is a native background session. */
  backgroundId?: string;
  /** Native process lifecycle, distinct from its idle/busy turn status. */
  nativeState?: string;
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

/** Every agent's listed sessions, or only `agents`'; an agent whose listing fails lists none. */
export async function listAgentProcesses(
  deps: ListingDeps,
  agents: readonly Agent[] = AGENT_NAMES,
): Promise<AgentProcess[]> {
  const lists = await Promise.all(
    agents.map(async (a) => {
      try {
        return await AGENTS[a].listing.list(deps);
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

const CachedListing = z
  .object({
    at: z.string(),
    processes: z.array(
      z.looseObject({ agent: z.enum(AGENT_NAMES), agentSessionId: z.string(), cwd: z.string() }),
    ),
  })
  .describe('agent listing');

/**
 * The listing, keeping the last one in `file`: the sessions of the agents in `reuse` come from it
 * while it is under `maxAgeMs` old (a look whose hooks are fresh, #896); otherwise every agent is
 * listed and the file replaced. A file that does not read is no listing.
 */
export function keptListing(deps: ListingDeps & { file: string; maxAgeMs: number }) {
  return async (reuse: readonly Agent[]): Promise<AgentProcess[]> => {
    let kept: z.infer<typeof CachedListing> | undefined;
    try {
      kept = reuse.length ? readJson(deps.file, CachedListing) : undefined;
    } catch {
      kept = undefined;
    }
    const now = deps.clock();
    if (kept && now.getTime() - Date.parse(kept.at) < deps.maxAgeMs) {
      const listed = await listAgentProcesses(
        deps,
        AGENT_NAMES.filter((a) => !reuse.includes(a)),
      );
      const reused = kept.processes.filter((p) => reuse.includes(p.agent)) as AgentProcess[];
      return [...listed, ...reused];
    }
    const listed = await listAgentProcesses(deps);
    mkdirSync(dirname(deps.file), { recursive: true, mode: 0o700 });
    writeFileAtomic(
      deps.file,
      `${JSON.stringify({ at: now.toISOString(), processes: listed })}\n`,
      0o600,
    );
    return listed;
  };
}
