import { timeAgo } from '@mesa/core/browser';
import { ListTodo } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { FollowViewDialog } from './FollowViewDialog';
import { ManageViewsDialog } from './ManageViewsDialog';
import { TicketList } from './TicketList';
import { TicketPanel } from './TicketPanel';
import { TicketsToolbar } from './TicketsToolbar';

/**
 * A project's Tickets tab (CONTEXT.md, Tickets tab): the followed views' tickets grouped by
 * status beside the selected ticket, which a session starts from. Narrow windows show the list,
 * then the ticket on its own.
 */
export function TicketsTab(props: { project: string; onSession: (id: string) => void }) {
  const { project } = props;
  const list = useCommand('tickets.list', { project });
  const run = useRun();
  const { acting, act } = useAct();
  const [view, setView] = useState<string>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const [narrowTicket, setNarrowTicket] = useState(false);
  const [dialog, setDialog] = useState<'follow' | 'manage'>();
  const [readAt, setReadAt] = useState<number>();
  const data = list.data;
  useEffect(() => {
    if (data) setReadAt(Date.now());
  }, [data]);
  const views = data?.views ?? [];
  // A view no longer followed falls back to every view; with one view, it is that view.
  const current = views.some((v) => v.name === view)
    ? view
    : views.length === 1
      ? views[0]?.name
      : undefined;
  const words = query.trim().toLowerCase();
  const tickets = (data?.tickets ?? []).filter(
    (t) =>
      (!current || t.views.includes(current)) &&
      (!words || `${t.key} ${t.summary}`.toLowerCase().includes(words)),
  );
  // Until one is picked, the first open ticket: done ones start collapsed in the list.
  const ticket =
    tickets.find((t) => t.key === selected) ??
    tickets.find((t) => t.category !== 'done') ??
    tickets[0];
  const counts = Object.fromEntries(
    views.map((v) => [
      v.name,
      (data?.tickets ?? []).filter((t) => t.views.includes(v.name)).length,
    ]),
  );
  const failing = views.filter((v) => v.error && (!current || v.name === current));
  const refresh = () => void list.refresh();
  const reconnect = () =>
    void act(async () => {
      if (await run('sources.connect', { source: 'atlassian' })) refresh();
      return undefined;
    });

  return (
    <div data-testid="tickets-tab" className="overflow-hidden rounded-xl border bg-card">
      {data && !views.length ? (
        <div className="grid place-items-center gap-2 px-6 py-16 text-center">
          <ListTodo aria-hidden className="size-6 text-muted-foreground" />
          <h2 className="text-base font-semibold">See your sprint here</h2>
          <Muted className="max-w-[44ch]">
            Follow a board's current sprint, a saved filter, or a query. Its tickets stay up to date
            as sprints change.
          </Muted>
          <Button className="mt-2" onClick={() => setDialog('follow')}>
            Follow a view
          </Button>
        </div>
      ) : (
        <>
          <TicketsToolbar
            project={project}
            views={views}
            view={current}
            counts={counts}
            onView={setView}
            onFollow={() => setDialog('follow')}
            onManage={() => setDialog('manage')}
            query={query}
            onQuery={setQuery}
            updated={readAt ? `Updated ${timeAgo(new Date(readAt).toISOString(), Date.now())}` : ''}
            busy={list.busy}
            onRefresh={refresh}
            settings={{
              projectPrompt: data?.projectPrompt ?? null,
              prompt: data?.prompt ?? null,
              defaults: data?.defaults ?? { notes: true, assign: true, start: 'worktree' },
            }}
            onSettingsChanged={refresh}
          />
          {failing.map((v) => (
            <div
              key={v.name}
              role="alert"
              className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-state-waiting/15 px-3 py-2 text-sm"
            >
              <span className="flex-1">
                {v.connect
                  ? `Mesa needs a fresh sign-in to read ${v.name} from Jira.`
                  : `${v.name}: ${v.error}`}
              </span>
              {v.connect && (
                <Button variant="outline" size="sm" disabled={acting} onClick={reconnect}>
                  Reconnect Atlassian
                </Button>
              )}
            </div>
          ))}
          <div className="grid min-h-[34rem] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div
              className={cn(
                'max-h-[40rem] overflow-auto md:border-r',
                narrowTicket && 'max-md:hidden',
              )}
            >
              {tickets.length ? (
                <TicketList
                  tickets={tickets}
                  selected={ticket?.key}
                  onSelect={(key) => {
                    setSelected(key);
                    setNarrowTicket(true);
                  }}
                />
              ) : (
                <Muted className="px-4 py-10 text-center">
                  {!data
                    ? 'Reading Jira...'
                    : (views.find((v) => v.name === current)?.note ??
                      (words ? 'No tickets match.' : 'No tickets in this view.'))}
                </Muted>
              )}
            </div>
            <div
              className={cn(
                'flex max-h-[40rem] min-h-0 flex-col',
                !narrowTicket && 'max-md:hidden',
              )}
            >
              {ticket && data && (
                <TicketPanel
                  key={ticket.key}
                  project={project}
                  ticket={ticket}
                  sprints={views
                    .filter((v) => ticket.views.includes(v.name))
                    .flatMap((v) => v.sprints ?? [])}
                  defaults={data.defaults}
                  prompt={data.prompt}
                  onBack={() => setNarrowTicket(false)}
                  onChanged={refresh}
                  onSession={props.onSession}
                />
              )}
            </div>
          </div>
        </>
      )}
      {dialog === 'follow' && (
        <FollowViewDialog
          project={project}
          following={views.map((v) => v.name)}
          onFollowed={() => {
            setDialog(undefined);
            refresh();
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'manage' && (
        <ManageViewsDialog
          project={project}
          views={views}
          onChanged={refresh}
          onClose={() => setDialog(undefined)}
        />
      )}
    </div>
  );
}
