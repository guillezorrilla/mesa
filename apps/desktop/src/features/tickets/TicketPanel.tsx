import type { Ticket, TicketDefaults } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { ArrowLeft, ExternalLink, Play } from 'lucide-react';
import { useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { AssigneeAvatar } from './AssigneeAvatar';
import { LiveDot } from './LiveDot';
import { StartSheet } from './StartSheet';
import { StatusIcon } from './StatusIcon';

/** Links in a ticket's text open in the browser, never in the app. */
const link = (href: string, children: React.ReactNode) => (
  <a className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/**
 * One ticket beside the list: its key and Jira link, title, who has a session on it, its
 * fields, description and comments, and Start session, which opens the start sheet.
 */
export function TicketPanel(props: {
  project: string;
  ticket: Ticket;
  /** The sprints of the views listing it. */
  sprints: string[];
  defaults: TicketDefaults;
  prompt: string | null;
  onBack: () => void;
  onChanged: () => void;
  onSession: (id: string) => void;
}) {
  const { ticket } = props;
  const detail = useCommand('tickets.show', { key: ticket.key });
  const run = useRun();
  const { acting, act } = useAct();
  const [starting, setStarting] = useState(false);
  const full = detail.data;
  const mine = full?.mine ?? ticket.mine;
  const assignee = full?.assignee?.name ?? ticket.assignee;
  const sessions = full?.sessions ?? ticket.sessions;
  const assign = () =>
    void act(async () => {
      if (await run('tickets.assign', { key: ticket.key })) {
        await detail.refresh();
        props.onChanged();
      }
      return undefined;
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ticket-panel">
      <div className="grid flex-1 content-start gap-5 overflow-auto px-6 py-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" className="-ml-2 md:hidden" onClick={props.onBack}>
            <ArrowLeft aria-hidden /> Tickets
          </Button>
          <span className="font-mono">{ticket.key}</span>
          <a
            href={ticket.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            Open in Jira <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
        <h2 className="text-xl leading-snug font-semibold text-balance">{ticket.summary}</h2>
        {sessions.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg bg-state-done/10 px-3 py-2 text-sm">
            <LiveDot />
            <span>
              A session is working on this in{' '}
              <b className="font-medium">{sessions.map((s) => s.project).join(', ')}</b>.
            </span>
          </div>
        )}
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-2">
            <StatusIcon category={ticket.category} />
            {ticket.status}
          </dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <AssigneeAvatar name={assignee} />
            {assignee ?? <span className="text-muted-foreground">Unassigned</span>}
            {!mine && (
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                disabled={acting}
                onClick={assign}
              >
                Assign to me
              </button>
            )}
          </dd>
          {(full?.priority ?? ticket.priority) && (
            <>
              <dt className="text-muted-foreground">Priority</dt>
              <dd>{full?.priority ?? ticket.priority}</dd>
            </>
          )}
          {full && full.labels.length > 0 && (
            <>
              <dt className="text-muted-foreground">Labels</dt>
              <dd className="flex flex-wrap gap-1.5">
                {full.labels.map((label) => (
                  <span key={label} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {label}
                  </span>
                ))}
              </dd>
            </>
          )}
          {props.sprints.length > 0 && (
            <>
              <dt className="text-muted-foreground">Sprint</dt>
              <dd>{props.sprints.join(', ')}</dd>
            </>
          )}
        </dl>
        <section aria-label="Description" className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
          {full ? (
            full.description ? (
              <div className="prose-sm max-w-[64ch] text-sm leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2">
                <MarkdownView text={full.description} link={link} />
              </div>
            ) : (
              <Muted>No description.</Muted>
            )
          ) : (
            <Muted>Reading the ticket...</Muted>
          )}
        </section>
        {full && (
          <section aria-label="Comments" className="grid gap-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Comments {full.comments.length > 0 && <span>{full.comments.length}</span>}
            </h3>
            {full.comments.length ? (
              full.comments.map((comment) => (
                <div
                  key={`${comment.author}-${comment.created}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 text-sm"
                >
                  <AssigneeAvatar name={comment.author} />
                  <div>
                    <span className="font-medium">{comment.author}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(comment.created, Date.now())}
                    </span>
                    <div className="mt-0.5 [&_p]:mb-1.5">
                      <MarkdownView text={comment.markdown} link={link} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Muted>No comments yet.</Muted>
            )}
          </section>
        )}
      </div>
      {starting ? (
        <StartSheet
          project={props.project}
          ticket={{ key: ticket.key, url: ticket.url, mine, assignee }}
          defaults={props.defaults}
          prompt={props.prompt}
          onCancel={() => setStarting(false)}
          onStarted={props.onChanged}
          onSession={props.onSession}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t bg-card px-6 py-3.5">
          <span className="min-w-40 flex-1 text-xs text-muted-foreground">
            {[
              props.prompt ?? 'No prompt',
              !mine && props.defaults.assign ? 'assign to me' : null,
              props.defaults.notes ? 'notes on' : 'notes off',
              props.defaults.start === 'worktree' ? 'new worktree' : 'main checkout',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <Button onClick={() => setStarting(true)} data-testid="start-ticket">
            <Play aria-hidden /> Start session
          </Button>
        </div>
      )}
    </div>
  );
}
