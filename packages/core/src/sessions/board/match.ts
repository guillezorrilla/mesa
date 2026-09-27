import type { AgentProcess } from '../agent-listing.js';
import type { SessionRecord } from '../record.js';
import { type TmuxWindow, targetLabel } from '../tmux/format.js';
import { windowOf } from '../window-name.js';

/**
 * Which record each listed process runs as. A stopped session runs nowhere, so only open ones can
 * be a listed process. By pid first, when the listing names one: a /clear gives the agent a new
 * session id in the same window. A resumed conversation keeps its id, so the newest open record
 * holding it wins.
 */
export function matchListed(
  records: readonly SessionRecord[],
  windows: readonly TmuxWindow[],
  listed: readonly AgentProcess[],
) {
  const open = records.filter((r) => !r.endedAt);
  const byWindow = new Map(open.map((r) => [targetLabel(windowOf(r)), r.id]));
  const byPane = new Map(windows.map((w) => [w.panePid, byWindow.get(targetLabel(w))]));
  const byAgentSession = new Map(
    open.flatMap((r) => (r.agentSessionId ? [[r.agentSessionId, r.id] as const] : [])),
  );
  /** The record a listed process runs as, if any. */
  const runs = (p: AgentProcess) =>
    (p.pid === undefined ? undefined : byPane.get(p.pid)) ?? byAgentSession.get(p.agentSessionId);
  const byRecord = new Map(
    listed.flatMap((p) => {
      const id = runs(p);
      return id ? [[id, p] as const] : [];
    }),
  );
  /** The listed process a record runs as, if any. */
  const listedAs = (id: string) => byRecord.get(id);
  return { runs, listedAs };
}
