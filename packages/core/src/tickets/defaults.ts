// A project's defaults for a session started from a ticket (CONTEXT.md, Tickets tab). Pure, so
// the app shows the same ones before tickets.yaml is read.

/** What each start on a ticket uses until the sheet changes it. */
export type TicketDefaults = {
  /** Write notes before the session starts. */
  notes: boolean;
  /** Assign the ticket to the person when it is someone else's or no one's. */
  assign: boolean;
  /** Move the ticket, while still to do, to its tracker's first in-progress status. */
  progress: boolean;
  /** Start in a new worktree on a branch named after the ticket, or in the main checkout. */
  start: 'worktree' | 'checkout';
};

/**
 * What a project gets until it changes them: assigning and a worktree on; notes off, as they slow
 * the start; moving to in progress off, as it changes the tracker for the whole team.
 */
export const DEFAULTS: TicketDefaults = {
  notes: false,
  assign: true,
  progress: false,
  start: 'worktree',
};
