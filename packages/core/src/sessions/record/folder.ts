import type { SessionRecord } from './record.js';

/**
 * The folder a session's agent works in when Mesa did not start it in the project's: its own
 * (adopted, General, or one its agent moved to), else its worktree. None means the project's.
 */
export const sessionFolder = (r: Pick<SessionRecord, 'cwd' | 'worktree'>) =>
  r.cwd ?? r.worktree?.path;
