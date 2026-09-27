import type { AgentProcess } from '../agent-listing.js';
import type { foreignId, SessionRecord } from '../record.js';
import type { Placement } from '../state.js';

// The Board's rows (CONTEXT.md, Board): a Mesa session's, or a foreign one's.

/**
 * One board row for a Mesa session: the record with the state and attention Faro gives it now
 * (`decision` holds the probabilities), `lastOutput` as its pane's last line now (read on each look,
 * not saved; the record's own field is not written yet), whether it is alive (its tmux window exists, a pane
 * whose agent exited still does, or the agent listing names it), and how long it has run.
 */
export type ManagedRow = SessionRecord &
  Placement & {
    managed: true;
    alive: boolean;
    runningSeconds: number;
    /** The agent listing's status (`idle`, `busy`, `waiting`), while it lists the session. */
    agentStatus?: string;
    /** The ids of the sessions whose `parent` it is, oldest first, listed or not. */
    children: string[];
  };

/**
 * A live agent session Mesa did not start, read-only: shown on the board, never acted on
 * (ADR-0003). `project` is the registered project it runs in, if any; Faro reads its state from
 * the listing alone.
 */
export type ForeignRow = Omit<AgentProcess, 'status' | 'waitingFor'> &
  Placement & {
    id: ReturnType<typeof foreignId>;
    managed: false;
    project: string | null;
    alive: true;
    /** The listing's status; none from a listing that says none (Codex's). */
    agentStatus?: string;
    runningSeconds: number;
  };

export type SessionRow = ManagedRow | ForeignRow;

/** Whole seconds from `from` until `until` (epoch ms), never below zero. */
export const secondsBetween = (from: string, until: number) =>
  Math.max(0, Math.round((until - Date.parse(from)) / 1000));
