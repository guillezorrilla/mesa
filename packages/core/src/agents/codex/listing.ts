import type { Clock } from '../../lib/clock.js';
import type { Env } from '../../lib/process.js';
import type { AgentProcess } from '../../sessions/agent-listing.js';
import { recentThreads } from './rollouts.js';

// Codex's side of the agent listing, ADR-0003's second signal. `codex agents` is a TUI with no
// JSON, which sees live state only for sessions on the app-server daemon that Mesa keeps its own
// off (docs/spikes/codex.md), so the listing is read from rollouts instead: which threads were
// written lately, and where. Nothing there says what a thread does now, or whether its codex still
// runs, so a row has no status.

/** How recently a rollout was written for its thread to list. */
const RECENT_MS = 10 * 60 * 1000;

/** The interactive Codex threads whose rollout was written in the last 10 minutes. */
export function listCodexSessions(deps: { env: Env; home: string; clock: Clock }): AgentProcess[] {
  const now = deps.clock();
  return recentThreads(deps, now, now.getTime() - RECENT_MS).map((t) => ({
    agent: 'codex',
    cwd: t.cwd,
    agentSessionId: t.id,
    startedAt: t.startedAt,
  }));
}
