// A project's defaults for a session started from a ticket (CONTEXT.md, Tickets tab). Pure, so
// the app shows the same ones before tickets.yaml is read.

/** What each start on a ticket uses until the sheet changes it. */
export type TicketDefaults = {
  /** Write notes before the session starts. */
  notes: boolean;
  /** Assign the ticket to the person when it is someone else's or no one's. */
  assign: boolean;
  /** Start in a new worktree on a branch named after the ticket, or in the main checkout. */
  start: 'worktree' | 'checkout';
};

/** What a project gets until it changes them: notes, assigning, and a worktree, all on. */
export const DEFAULTS: TicketDefaults = {
  notes: true,
  assign: true,
  start: 'worktree',
};
