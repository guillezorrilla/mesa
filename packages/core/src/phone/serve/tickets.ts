import { clip } from '../../lib/clip.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { FollowedView, Ticket } from '../../tickets/service.js';
import type { ticketActions } from '../../tickets/ticket.js';
import type { CallResult } from '../protocol/rpc.js';

/** The ticket functions the CLI uses (`mesa tickets`, `tickets show`, `tickets assign`). */
export type TicketDeps = {
  tickets: (project: string) => Promise<{ views: FollowedView[]; tickets: Ticket[] }>;
  ticket: ReturnType<typeof ticketActions>['show'];
  assign: (id: string, site?: string) => Promise<Recorded<{ assignee: string }>>;
};

/** How much of a ticket the phone gets. */
const DESCRIPTION_CHARS = 8_000;
const COMMENTS = 5;
const COMMENT_CHARS = 1_500;

/** A project's followed tickets, as its Tickets list shows them. */
export async function phoneTickets(deps: TicketDeps, project: string) {
  const { views, tickets } = await deps.tickets(project);
  return {
    views: views.map((v) => ({
      name: v.name,
      ...(v.note ? { note: v.note } : {}),
      ...(v.error ? { error: v.error } : {}),
    })),
    tickets: tickets.map((t) => ({
      id: t.id,
      key: t.key,
      summary: t.summary,
      status: t.status,
      category: t.category,
      ...(t.assignee ? { assignee: t.assignee } : {}),
      mine: t.mine,
      url: t.url,
      ...(t.site ? { site: t.site } : {}),
      sessions: t.sessions.map((s) => s.id),
    })),
  } satisfies CallResult<'tickets'>;
}

/** One ticket, its description and newest comments cut for a phone. */
export async function phoneTicket(deps: TicketDeps, id: string, site?: string) {
  const t = await deps.ticket(id, site);
  // As `mesa tickets show` reads them: several assignees where a provider allows them.
  const assignees = 'assignees' in t ? t.assignees : t.assignee ? [t.assignee] : [];
  return {
    id: t.id,
    key: t.key,
    summary: t.summary,
    status: t.status ?? '',
    url: t.url,
    mine: t.mine,
    assignees: assignees.map((a) => a.name),
    description: clip(t.description ?? '', DESCRIPTION_CHARS),
    comments: t.comments.slice(-COMMENTS).map((c) => ({
      author: c.author,
      at: c.created,
      text: clip(c.markdown, COMMENT_CHARS),
    })),
    sessions: t.sessions.map((s) => s.id),
  } satisfies CallResult<'ticket'>;
}
