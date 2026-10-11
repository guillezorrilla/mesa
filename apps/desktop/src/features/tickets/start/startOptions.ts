import type { TicketDefaults } from '@mesa/core';
import { branchOf } from '@mesa/core/browser';

/** The ticket a session starts from, as the Tickets tab shows it. */
export type StartTicket = {
  key: string;
  url: string;
  /** Its summary in Jira. */
  title: string;
  mine: boolean;
  assignee?: string | undefined;
};

/** How a session on a ticket starts, whichever Ticket start: the sheet's choices. */
export type StartOptions = {
  assign: boolean;
  /** Your rules: a Saved prompt's name every start follows, or null for none. */
  prompt: string | null;
  notes: boolean;
  start: 'worktree' | 'checkout';
};

/** The options a ticket starts with: the project's defaults, and its ticket prompt as Your rules. */
export const initialOptions = (
  defaults: TicketDefaults,
  ticket: StartTicket,
  prompt: string | null,
): StartOptions => ({
  assign: defaults.assign && !ticket.mine,
  prompt,
  notes: defaults.notes,
  start: defaults.start,
});

/** Where the session runs, as a phrase: a new worktree on the ticket's branch, or the checkout. */
export const placeOf = (key: string, start: StartOptions['start']) =>
  start === 'worktree' ? `a new worktree on ${branchOf(key)}` : 'the main checkout';

/** `options` in a few words, for the footer: what each start button does with one click. */
export const describeOptions = (key: string, options: StartOptions) =>
  [
    `Runs in ${placeOf(key, options.start)}`,
    options.assign && 'assign to me',
    options.notes && 'notes first',
    options.prompt && `your rules: ${options.prompt}`,
  ]
    .filter(Boolean)
    .join(' · ');
