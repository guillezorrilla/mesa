import { claudeContext } from '../agents/claude/context-use.js';
import type { Env } from '../lib/process.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

/**
 * Reads a session's context use now and keeps it on its record, written only when it changed:
 * a Claude Code session's from its transcript; none for an agent Mesa cannot read, or a session
 * that has not run. A transcript that cannot be read, or a reading that does not fit the record,
 * keeps the last reading.
 */
export function refreshContext(
  deps: { store: SessionStore; home: string; env: Env },
  record: SessionRecord,
): SessionRecord {
  if (record.agent !== 'claude' || !record.agentSessionId) return record;
  try {
    const context = claudeContext(deps, record.agentSessionId);
    if (JSON.stringify(context) === JSON.stringify(record.context)) return record;
    return deps.store.update(record.id, { context });
  } catch {
    return record;
  }
}
