import { z } from 'zod';
import type { Runner } from '../../lib/process.js';
import type { AgentProcess } from '../../sessions/agent-listing.js';
import type { SessionState } from '../../sessions/states.js';

// Claude Code's agent listing, ADR-0003's second signal: `claude agents --json` names every live
// Claude Code session on the machine, Mesa's and the owner's alike (docs/spikes/state-signals.md).

const ListingSchema = z.array(
  z.object({
    pid: z.number().int().positive(),
    cwd: z.string(),
    // Epoch ms; the cap is the largest a Date takes, so toISOString never throws.
    startedAt: z.number().nonnegative().max(8.64e15),
    sessionId: z.string(),
    status: z.string(),
    waitingFor: z.string().optional(),
  }),
);

/** Each call took about 0.5 s in the spike; a slow or broken listing must not hold the board up. */
const LISTING_TIMEOUT_MS = 2000;

/** The live Claude Code processes, or `[]` when the listing fails, times out, or does not parse. */
export async function listClaudeProcesses(run: Runner): Promise<AgentProcess[]> {
  const res = await run('claude', ['agents', '--json'], LISTING_TIMEOUT_MS);
  if (!res.ok) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(res.stdout);
  } catch {
    return [];
  }
  const parsed = ListingSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.map((p) => ({
    agent: 'claude',
    pid: p.pid,
    cwd: p.cwd,
    agentSessionId: p.sessionId,
    startedAt: new Date(p.startedAt).toISOString(),
    status: p.status,
    ...(p.waitingFor === undefined ? {} : { waitingFor: p.waitingFor }),
  }));
}

/** What each listed status means as a session state (docs/spikes/state-signals.md). */
const LISTED: Record<string, SessionState> = {
  idle: 'idle',
  busy: 'working',
  'waiting:permission prompt': 'waiting-permission',
  'waiting:input needed': 'waiting-question',
};

/**
 * The state the listing alone gives, at ADR-0003's 0.85. A wait it cannot name still needs a
 * person (0.6); a status it has never shown is a guess at `working` (0.5).
 */
export function claudeListedState(p: Pick<AgentProcess, 'status' | 'waitingFor'>): {
  state: SessionState;
  confidence: number;
} {
  const state = LISTED[p.waitingFor ? `${p.status}:${p.waitingFor}` : p.status];
  if (state) return { state, confidence: 0.85 };
  return p.status === 'waiting'
    ? { state: 'waiting-question', confidence: 0.6 }
    : { state: 'working', confidence: 0.5 };
}
