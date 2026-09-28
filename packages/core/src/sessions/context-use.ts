import { AGENTS } from '../agents/agents.js';
import type { Env } from '../lib/process.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

/**
 * Reads a session's context use now, as its agent reads it (Claude Code: from its transcript),
 * and keeps it on its record, written only when it changed; none for an agent Mesa cannot read, or a session
 * that has not run. A transcript that cannot be read, or a reading that does not fit the record,
 * keeps the last reading.
 */
export function refreshContext(
  deps: { store: SessionStore; home: string; env: Env },
  record: SessionRecord,
): SessionRecord {
  if (record.agent === 'terminal') return record;
  const read = AGENTS[record.agent].context;
  if (!read || !record.agentSessionId) return record;
  try {
    const context = read(deps, record.agentSessionId);
    if (JSON.stringify(context) === JSON.stringify(record.context)) return record;
    return deps.store.update(record.id, { context });
  } catch {
    return record;
  }
}
