import type { PhoneTicket, PhoneTicketDetail } from '@mesa/core/phone';

const live = (n: number) => (n ? `${n} live session${n === 1 ? '' : 's'}` : undefined);

/** A ticket row's second line: its status, whose it is, and its live sessions. */
export function ticketDetail(t: PhoneTicket) {
  const whose = t.mine ? 'Yours' : (t.assignee ?? 'Unassigned');
  return [t.status, whose, live(t.sessions.length)].filter(Boolean).join(' · ');
}

/** Who a ticket's panel says it is with. */
export function assigneesText(t: Pick<PhoneTicketDetail, 'assignees' | 'mine'>) {
  if (!t.assignees.length) return 'Unassigned';
  return `${t.assignees.join(', ')}${t.mine ? ' (you)' : ''}`;
}

/** The ticket as a session started from it names it: its key, then its summary. */
export const ticketTitle = (t: Pick<PhoneTicket, 'key' | 'summary'>) => `${t.key}: ${t.summary}`;

/** What the list says with no ticket: no view followed, or every view empty. */
export const noTicketsText = (views: number) =>
  views
    ? 'No tickets in the views this project follows.'
    : 'This project follows no ticket views. Follow one in Mesa on your Mac.';
