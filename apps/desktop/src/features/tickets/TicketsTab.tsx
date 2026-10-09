import type { Ticket } from '@mesa/core';
import { ListTodo, Play, Plus, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { FollowViewDialog } from './FollowViewDialog';
import { TicketPromptFields } from './TicketPromptFields';

/**
 * A project's Tickets tab (CONTEXT.md, Tickets tab): the Jira views it follows, read live, their
 * tickets once each, and Start session on one, which imports it (with Write notes as the Context
 * tab has it) and hands its key to `onStartSession`.
 */
export function TicketsTab(props: {
  project: string;
  notes: boolean;
  onNotesChange: (notes: boolean) => void;
  onStartSession: (from: string) => void;
}) {
  const { project } = props;
  const list = useCommand('tickets.list', { project });
  const run = useRun();
  const { acting, act } = useAct();
  const [following, setFollowing] = useState(false);
  // The ticket being imported for a session: with Write notes on, that takes a minute or more.
  const [starting, setStarting] = useState<{ key: string; notes: boolean }>();
  const data = list.data;
  const unfollow = (view: string) =>
    void act(async () => {
      if (await run('tickets.unfollow', { project, view })) await list.refresh();
      return undefined;
    });
  const reconnect = () =>
    void act(async () => {
      if (await run('sources.connect', { source: 'atlassian' })) await list.refresh();
      return undefined;
    });
  const start = (ticket: Ticket) =>
    void act(async () => {
      const notes = props.notes;
      setStarting({ key: ticket.key, notes });
      try {
        if (await run('imports.add', { project, links: [ticket.url], notes }))
          props.onStartSession(ticket.key);
      } finally {
        setStarting(undefined);
      }
      return undefined;
    });
  return (
    <div data-testid="tickets-tab" className="space-y-8">
      <section aria-label="Following" className="space-y-3">
        <SectionLabel className="flex items-center gap-2">
          <ListTodo aria-hidden className="size-4" /> Following
        </SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          {data?.views.map((view) => (
            <Badge key={view.name} variant="secondary" title={view.describe} className="gap-1">
              {view.name}
              {view.sprints && <span className="opacity-70">{view.sprints.join(', ')}</span>}
              <IconButton
                label={`Unfollow ${view.name}`}
                icon={X}
                size="icon-xs"
                disabled={acting}
                onClick={() => unfollow(view.name)}
              />
            </Badge>
          ))}
          <Button variant="outline" size="sm" disabled={acting} onClick={() => setFollowing(true)}>
            <Plus aria-hidden /> Follow
          </Button>
          <IconButton
            label="Refresh tickets"
            icon={RefreshCw}
            disabled={acting || list.busy}
            onClick={() => void list.refresh()}
          />
        </div>
        {data?.views.map(
          (view) =>
            (view.error ?? view.note) && (
              <p
                key={view.name}
                role={view.error ? 'alert' : 'status'}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                {view.name}: {view.error ?? view.note}
                {view.connect && (
                  <Button variant="outline" size="sm" disabled={acting} onClick={reconnect}>
                    Reconnect Atlassian
                  </Button>
                )}
              </p>
            ),
        )}
        {data && !data.views.length && (
          <Muted>
            Follow a board&apos;s sprint, a saved filter, or a JQL query to list its tickets.
          </Muted>
        )}
      </section>
      <TicketPromptFields
        project={project}
        prompt={data?.prompt ?? null}
        projectPrompt={data?.projectPrompt ?? null}
        onChanged={() => void list.refresh()}
      />
      <section aria-label="Tickets" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Tickets</SectionLabel>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch
              checked={props.notes}
              onCheckedChange={props.onNotesChange}
              aria-label="Write notes"
            />
            Write notes
          </Label>
        </div>
        {starting && (
          <Muted role="status">
            Importing {starting.key}
            {starting.notes ? ' and writing its notes, which can take a minute or two' : ''}...
          </Muted>
        )}
        {list.busy && !data ? (
          <Muted>Reading Jira...</Muted>
        ) : data?.tickets.length ? (
          <ul className="divide-y rounded-lg border">
            {data.tickets.map((ticket) => (
              <li
                key={`${ticket.site}:${ticket.key}`}
                data-testid="ticket-row"
                className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-sm"
              >
                <a
                  href={ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-xs hover:underline"
                >
                  {ticket.key}
                </a>
                <span className="min-w-0 flex-1 truncate" title={ticket.summary}>
                  {ticket.summary}
                </span>
                {ticket.sessions.map((session) => (
                  <Badge key={session.id} variant="outline">
                    Running in {session.project}
                  </Badge>
                ))}
                <Badge variant="secondary">{ticket.status}</Badge>
                {ticket.assignee && (
                  <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                    {ticket.assignee}
                  </span>
                )}
                <IconButton
                  label={`Start session from ${ticket.key}`}
                  icon={Play}
                  disabled={acting}
                  onClick={() => start(ticket)}
                />
              </li>
            ))}
          </ul>
        ) : data?.views.length ? (
          <Muted>No tickets in the views this project follows.</Muted>
        ) : null}
      </section>
      {following && (
        <FollowViewDialog
          project={project}
          following={data?.views.map((view) => view.name) ?? []}
          onFollowed={() => {
            setFollowing(false);
            void list.refresh();
          }}
          onCancel={() => setFollowing(false)}
        />
      )}
    </div>
  );
}
