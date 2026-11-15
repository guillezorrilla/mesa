import type { PhoneTicket } from '@mesa/core/phone';

/** The chip that shows every followed view's tickets. */
export const ALL_VIEWS = '';

/**
 * The view chips over a project's tickets, as the Mac app's view switcher: All first, then each
 * followed view with how many tickets it lists; none with fewer than two views, or from a Mac
 * that does not say which views list a ticket.
 */
export function viewChoices(views: readonly { name: string }[], tickets: readonly PhoneTicket[]) {
  if (views.length < 2 || !tickets.every((t) => t.views)) return [];
  return [
    { value: ALL_VIEWS, label: 'All', count: tickets.length },
    ...views.map((v) => ({
      value: v.name,
      label: v.name,
      count: tickets.filter((t) => t.views?.includes(v.name)).length,
    })),
  ];
}

/** The tickets `view` lists; every ticket for All, or for a view no longer followed. */
export const inView = (
  tickets: readonly PhoneTicket[],
  view: string | undefined,
  choices: readonly { value: string }[],
) =>
  view && choices.some((c) => c.value === view)
    ? tickets.filter((t) => t.views?.includes(view))
    : tickets;
