import { AGENTS } from '../../agents/agents.js';
import type { Env } from '../../lib/process.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';

/**
 * Reads what a session's agent says of it now, as that agent reads it (Claude Code: from its
 * transcript), its context use, its branch and a folder it moved to, and keeps them on its
 * record in one write, made only when one changed; none for an agent Mesa cannot read, or a session
 * that has not run. A transcript that cannot be read, or a reading that does not fit the record,
 * keeps the last reading. Without `wait`, a record another process holds is not waited for.
 */
export function refreshReadings(
  deps: { store: SessionStore; home: string; env: Env },
  record: SessionRecord,
  { wait = true } = {},
): SessionRecord {
  if (record.agent === 'terminal' || !record.agentSessionId) return record;
  const id = record.agentSessionId;
  const { context: readContext, transcripts } = AGENTS[record.agent];
  try {
    const context = readContext?.(deps, id);
    const file = (transcripts?.branch || transcripts?.folder) && transcripts.file(deps, id);
    const { gitBranch, moved } = file
      ? { gitBranch: transcripts.branch?.(file), moved: transcripts.folder?.(file) }
      : {};
    // Back where Mesa started it (its project or worktree), it has no folder of its own again; an
    // adopted or General session's start is its own folder.
    const started = !record.adopted && record.project !== GENERAL_PROJECT;
    const cwd = moved && !(moved.back && started) ? moved.path : undefined;
    const changed = {
      ...(readContext && JSON.stringify(context) !== JSON.stringify(record.context)
        ? { context }
        : {}),
      ...(gitBranch !== undefined && gitBranch !== record.gitBranch ? { gitBranch } : {}),
      // Its own folder, not its worktree: the worktree is the one Mesa holds for it, if any.
      ...(moved && cwd !== record.cwd ? { cwd } : {}),
    };
    return Object.keys(changed).length ? deps.store.update(record.id, changed, { wait }) : record;
  } catch {
    return record;
  }
}
