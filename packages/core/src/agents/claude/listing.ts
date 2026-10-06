import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Env, Runner } from '../../lib/process.js';
import type { AgentProcess } from '../../sessions/agent-listing.js';
import type { SessionState } from '../../sessions/states.js';
import { claudeLiveSessions } from './paths.js';

// Claude Code's agent listing, ADR-0003's second signal: `claude agents --json --all` names
// live sessions and stopped background handles, Mesa's and the owner's alike.

const ListingSchema = z.array(
  z.object({
    pid: z.number().int().positive().optional(),
    cwd: z.string(),
    // Epoch ms; the cap is the largest a Date takes, so toISOString never throws.
    startedAt: z.number().nonnegative().max(8.64e15),
    sessionId: z.string(),
    id: z.string().optional(),
    state: z.string().optional(),
    status: z.string().optional(),
    waitingFor: z.string().optional(),
  }),
);

/**
 * The name a person gave session `sessionId`'s live process `pid` with /rename, from its state
 * file in `liveDir`; none for the name Claude Code derives from the folder, a file another session
 * left, or one it cannot read.
 */
function renamed(liveDir: string, pid: number | undefined, sessionId: string): string | undefined {
  if (!pid) return undefined;
  try {
    const state = JSON.parse(readFileSync(join(liveDir, `${pid}.json`), 'utf8'));
    const name = typeof state?.name === 'string' ? state.name.trim() : '';
    return state?.nameSource === 'user' && state.sessionId === sessionId && name ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Each call took about 0.5 s in the spike; a slow or broken listing must not hold the board up. */
const LISTING_TIMEOUT_MS = 2000;

/** Claude Code sessions, or `[]` when the listing fails, times out, or does not parse. */
export async function listClaudeProcesses({
  run,
  home,
  env,
}: {
  run: Runner;
  home: string;
  env: Env;
}): Promise<AgentProcess[]> {
  const res = await run('claude', ['agents', '--json', '--all'], LISTING_TIMEOUT_MS);
  if (!res.ok) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(res.stdout);
  } catch {
    return [];
  }
  const parsed = ListingSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.map((p) => {
    const name = renamed(claudeLiveSessions(home, env), p.pid, p.sessionId);
    return {
      agent: 'claude' as const,
      ...(p.pid ? { pid: p.pid } : {}),
      cwd: p.cwd,
      agentSessionId: p.sessionId,
      ...(name ? { name } : {}),
      ...(p.id ? { backgroundId: p.id } : {}),
      ...(p.state ? { nativeState: p.state } : {}),
      startedAt: new Date(p.startedAt).toISOString(),
      ...(p.status ? { status: p.status } : {}),
      ...(p.waitingFor === undefined ? {} : { waitingFor: p.waitingFor }),
    };
  });
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
export function claudeListedState(p: Pick<AgentProcess, 'status' | 'waitingFor' | 'nativeState'>): {
  state: SessionState;
  confidence: number;
} {
  if (p.nativeState === 'stopped') return { state: 'done', confidence: 0.85 };
  const state = LISTED[p.waitingFor ? `${p.status}:${p.waitingFor}` : (p.status ?? '')];
  if (state) return { state, confidence: 0.85 };
  return p.status === 'waiting'
    ? { state: 'waiting-question', confidence: 0.6 }
    : { state: 'working', confidence: 0.5 };
}
