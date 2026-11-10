import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { readJson } from '../lib/json-file.js';
import { type AgentProcess, type ListingDeps, listAgentProcesses } from './listing.js';
import { AGENT_NAMES, type Agent } from './names.js';

// The last agent listing a look ran, kept in a file so a look whose hooks settle every session
// can skip a costly listing and still show the foreign rows it gives (#896).

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
 * listed and the file replaced. A file that does not read, or cannot be written, is no listing.
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
    try {
      mkdirSync(dirname(deps.file), { recursive: true, mode: 0o700 });
      writeFileAtomic(
        deps.file,
        `${JSON.stringify({ at: now.toISOString(), processes: listed })}\n`,
        0o600,
      );
    } catch {
      // Kept only to save the next look a listing: a failed write costs that, not this look.
    }
    return listed;
  };
}
