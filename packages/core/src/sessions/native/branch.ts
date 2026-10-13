import { AGENTS } from '../../agents/agents.js';
import type { Env } from '../../lib/process.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';

/**
 * Reads the git branch a session's agent works on now, as its transcript names it (Claude Code:
 * each line's `gitBranch`, so a worktree it entered or a branch it made shows), and keeps it on its
 * record, written only when it changed; none for an agent that does not say, or a session that has
 * not run. A transcript that cannot be read keeps the last reading. Without `wait`, a record
 * another process holds is not waited for.
 */
export function refreshBranch(
  deps: { store: SessionStore; home: string; env: Env },
  record: SessionRecord,
  { wait = true } = {},
): SessionRecord {
  if (record.agent === 'terminal' || !record.agentSessionId) return record;
  const transcripts = AGENTS[record.agent].transcripts;
  if (!transcripts?.branch) return record;
  try {
    const file = transcripts.file(deps, record.agentSessionId);
    const gitBranch = file && transcripts.branch(file);
    if (!gitBranch || gitBranch === record.gitBranch) return record;
    return deps.store.update(record.id, { gitBranch }, { wait });
  } catch {
    return record;
  }
}
