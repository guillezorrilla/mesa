import type { PhoneTicket } from '@mesa/core/phone';
import { ALL } from '../../lib/keptChoice';

/**
 * The view chips over a project's tickets, as the Mac app's view switcher: All first, then each
 * followed view with how many tickets it lists; none with fewer than two views, or from a Mac
 * that does not say which views list a ticket.
 */
export function viewChoices(views: readonly { name: string }[], tickets: readonly PhoneTicket[]) {
  if (views.length < 2 || !tickets.every((t) => t.views)) return [];
  return [
    { value: ALL, label: 'All', count: tickets.length },
    ...views.map((v) => ({
      value: v.name,
      label: v.name,
      count: tickets.filter((t) => t.views?.includes(v.name)).length,
    })),
  ];
}

/** The tickets `view` lists; every ticket for All. */
export const inView = (tickets: readonly PhoneTicket[], view: string) =>
  view === ALL ? tickets : tickets.filter((t) => t.views?.includes(view));
