import { AGENTS } from '../../agents/agents.js';
import type { Env } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
import { isAgentState } from '../record/states.js';
import { folderOf } from '../start/launch.js';

/**
 * The agent session ids a look reads for the sessions whose agent picks its own (Codex), by
 * record id: each one that ran and has none yet, from its agent's files, started between its
 * window opening and its stop. Newest window first, each taking an id no session holds (`taken`,
 * and those taken before it), so of two sessions started in one folder, each gets the thread
 * started after its own window opened.
 */
export function ownSessionIds(
  deps: { env: Env; home: string; logs?: string; projects: readonly RegistryEntry[] },
  records: readonly SessionRecord[],
  taken: ReadonlySet<string>,
): Map<string, string> {
  const held = new Set(taken);
  const read = new Map<string, string>();
  const unread = records
    .filter((r) => r.agent !== 'terminal' && !r.agentSessionId && isAgentState(r.lastState.state))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const r of unread) {
    if (r.agent === 'terminal') continue;
    const own = AGENTS[r.agent].ownSessionId;
    const project = deps.projects.find((p) => p.name === r.project);
    if (!own || (!project && r.project !== GENERAL_PROJECT)) continue;
    const folder = folderOf(r, project ?? null);
    const id = own(deps, { id: r.id, folder, since: r.startedAt, until: r.endedAt }, held);
    if (id) {
      held.add(id);
      read.set(r.id, id);
    }
  }
  return read;
}
