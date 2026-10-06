import { counted, odds } from '../../lib/format.js';
import type { SessionRow } from '../board/rows.js';
import { sessionProjects } from './session-projects.js';

// How Mesa shows a session row and its log to a person, the same in the CLI and on the Board.
// Pure, importing only pure modules, so the app bundles it (`@mesa/core/browser`).

/** A session's name when a person gave it one, else the one its agent gives it, else its id. */
export const sessionLabel = (s: {
  id: string;
  name?: string;
  agentName?: string;
  managed?: boolean;
}) => (s.managed !== false && (s.name || s.agentName)) || s.id;

/**
 * What a session's card calls it: its name, else the one its agent gives it, else its goal's first
 * line, else its id.
 */
export const sessionTitle = (s: SessionRow) =>
  (s.managed && (s.name || s.agentName || s.goal?.trim().split(/\r?\n/, 1)[0])) || s.id;

/** A Mesa session that runs a skill headlessly (CONTEXT.md, Skill run). */
export const isRun = (s: SessionRow) => s.managed && s.kind === 'run';

/**
 * A Mesa session's additional projects as its row names them after its own, `+tide-pool,driftwood`
 * (CONTEXT.md, Additional project); none without.
 */
export const additionalLabel = (s: SessionRow) =>
  s.managed && s.additional ? `+${sessionProjects(s).slice(1).join(',')}` : undefined;

/** The branch a Mesa session runs on (its worktree's), or will once it starts (a queued one's). */
export const sessionBranch = (s: SessionRow) =>
  s.managed ? (s.worktree?.branch ?? s.pending?.branch) : undefined;

/** A number of sessions as it reads: `1 session`, `2 sessions`. */
export const sessionCount = (n: number) => counted(n, 'session');

/** Said with every adoption (CONTEXT.md, Adopted session): two agents on one transcript interleave it. */
export const ADOPTION_WARNING =
  'end the session in its original terminal first: both hold the same transcript';

/** What a queued session shows in place of its output. */
export const waitingOn = (after: string | undefined) => `waiting on ${after}`;

/** Why a session may have no output log, as `mesa logs` and the Board's Log say it. */
export const NO_OUTPUT_LOG =
  'it has not started, or config sessions.log was off when it did, or it started before Mesa kept output logs';

/** A session's attention score (0 to 1) as it reads: `0.83`. */
export const attentionScore = (attention: number) => odds(attention);

/** How full a session's context is, as the whole percent shown: 0 to 100 whatever the reading. */
export const contextPercent = (used: number) => Math.round(Math.min(100, Math.max(0, used)));
