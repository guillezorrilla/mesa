import type { AgentProcess } from '../../agents/listing.js';
import type { ChildReport } from '../../reports/reports.js';
import type { TakenOver } from '../record/holders.js';
import type { foreignId, SessionRecord } from '../record/record.js';
import type { Supervision } from '../signals/placements.js';
import type { Placement } from '../signals/state.js';
import type { LineCounts } from './line-counts.js';
import type { BranchPullRequest } from './pull-requests.js';

// The Board's rows (CONTEXT.md, Board): a Mesa session's, or a foreign one's.

/** A child's newest report that says something, as the sidebar and the Crew panel show it. */
export type CrewReport = Pick<ChildReport, 'kind' | 'at' | 'outcome' | 'question' | 'details'> & {
  message: string;
};

/**
 * One board row for a Mesa session: the record with the state and attention Faro gives it now
 * (`decision` holds the probabilities), `lastOutput` as its pane's last line now (read on each look,
 * not saved; the record's own field is not written yet), whether it is alive (its tmux window exists, a pane
 * whose agent exited still does, or the agent listing names it), and how long it has run.
 */
export type ManagedRow = { hasOutputLog?: boolean } & SessionRecord &
  Placement & {
    managed: true;
    alive: boolean;
    runningSeconds: number;
    /** The agent listing's status (`idle`, `busy`, `waiting`), while it lists the session. */
    agentStatus?: string;
    nativeState?: string;
    /**
     * Where it reports now (familyOf): its `parent`, or the session that parent was resumed or
     * handed off as; null when it reports to no session; none without a parent.
     */
    parentNow?: string | null;
    /** The ids of the sessions that report to it now (`parentNow`), oldest first, listed or not. */
    children: string[];
    /** Its worktrees a newer session took over (takenOver), which removing it leaves; none without. */
    takenOver?: TakenOver[];
    /** It has a conversation an agent swap would lose (hasConversation): it hands off instead. */
    conversation?: true;
    /** Who placed its state, the rules or the chosen model, and that model's reply (#461). */
    supervision: Supervision;
    /**
     * Its main agent's newest reply that ended a turn (stopReply), as its hook log keeps it; once
     * it ended, the one its record kept (`finalReply`).
     */
    lastReply?: { text: string; at: string };
    /**
     * The lines its checkout added and removed since it left its base, untracked files too, as
     * its crew row counts them (lineCounts).
     */
    lines?: LineCounts;
    /** The pull request of its branch in its project's repository (withPullRequests). */
    pr?: BranchPullRequest;
    /** A child's: its task's title (withCrewNews); none without a task. */
    taskTitle?: string;
    /** A child's: its newest report that says something (withCrewNews). */
    report?: CrewReport;
    /** A Setup session's: its setup command failed (a SetupFailed hook event). */
    setupFailed?: true;
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
