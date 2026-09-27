import { AGENTS } from '../../agents/agents.js';
import type { Env } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { folderOf } from '../launch.js';
import type { SessionRecord } from '../record.js';
import { isAgentState } from '../states.js';

/**
 * The agent session ids a look reads for the sessions whose agent picks its own (Codex), by
 * record id: each one that ran and has none yet, from its agent's files, started between its
 * window opening and its stop. Newest window first, each taking an id no session holds (`taken`,
 * and those taken before it), so of two sessions started in one folder, each gets the thread
 * started after its own window opened.
 */
export function ownSessionIds(
  deps: { env: Env; home: string; projects: readonly RegistryEntry[] },
  records: readonly SessionRecord[],
  taken: ReadonlySet<string>,
): Map<string, string> {
  const held = new Set(taken);
  const read = new Map<string, string>();
  const unread = records
    .filter((r) => !r.agentSessionId && isAgentState(r.lastState.state))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const r of unread) {
    const own = AGENTS[r.agent].ownSessionId;
    const project = deps.projects.find((p) => p.name === r.project);
    if (!own || !project) continue;
    const folder = folderOf(r, project);
    const id = own(deps, { folder, since: r.startedAt, until: r.endedAt }, held);
    if (id) {
      held.add(id);
      read.set(r.id, id);
    }
  }
  return read;
}
