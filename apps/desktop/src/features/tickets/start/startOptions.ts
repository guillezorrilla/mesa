import type { ProviderId } from '@mesa/core';
import { branchOf, type TicketDefaults } from '@mesa/core/browser';

/** The ticket a session starts from, as the Tickets tab shows it. */
export type StartTicket = {
  /** Its key in its tracker (LC-12, owner/repo#12), which imports and names its branch. */
  key: string;
  /** Its id across trackers (jira:LC-12), which assigns it. */
  id: string;
  /** Its key as the tab shows it (#12 for GitHub). */
  label: string;
  provider: ProviderId;
  /** Its tracker takes several assignees, so assigning adds the person beside them. */
  several: boolean;
  /** Its tracker's name in a sentence. */
  trackerName: string;
  url: string;
  /** Its summary in its tracker. */
  summary: string;
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

/** The Assign to me choice for `ticket`: a tracker with several assignees adds me beside them. */
export const assignLabel = (ticket: Pick<StartTicket, 'label' | 'several'>) =>
  ticket.several ? `Add me to ${ticket.label}` : `Assign ${ticket.label} to me`;

/** Where the session runs, as a phrase: a new worktree on the ticket's branch, or the checkout. */
export const placeOf = (key: string, start: StartOptions['start']) =>
  start === 'worktree' ? `a new worktree on ${branchOf(key)}` : 'the main checkout';

/**
 * `options` in a few words, for the footer: what each start button does with one click. Assign
 * to me is left out: the footer shows it as its own check.
 */
export const describeOptions = (key: string, options: StartOptions) =>
  [
    `Runs in ${placeOf(key, options.start)}`,
    options.notes && 'notes first',
    options.prompt && `your rules: ${options.prompt}`,
  ]
    .filter(Boolean)
    .join(' · ');
