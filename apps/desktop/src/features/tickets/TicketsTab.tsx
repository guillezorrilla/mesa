import { DEFAULTS, timeAgo } from '@mesa/core/browser';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';
import { useReadAt } from '@/lib/useReadAt';
import { cn } from '@/lib/utils';
import { ElsewhereLink } from './ElsewhereLink';
import { ManageViewsDialog } from './ManageViewsDialog';
import { NotConnectedPanel } from './NotConnectedPanel';
import { SignInBanner } from './SignInBanner';
import { SwitchTrackerDialog } from './SwitchTrackerDialog';
import { TicketList } from './TicketList';
import { TicketPanel } from './TicketPanel';
import { TicketsToolbar } from './TicketsToolbar';
import { TrackerChoice } from './TrackerChoice';
import { TRACKERS } from './trackers';
import { useKeptPick } from './useKeptPick';

/**
 * A project's Tickets tab (CONTEXT.md, Tickets tab): the followed views' tickets grouped by
 * status beside the selected ticket, which a session starts from, in its tracker's words. Narrow
 * windows show the list, then the ticket on its own. A project with no tracker yet picks one
 * first (TrackerChoice); the gear changes it (SwitchTrackerDialog).
 */
export function TicketsTab(props: { project: string; onSession: (id: string) => void }) {
  const { project } = props;
  const list = useCommand('tickets.list', { project });
  const [view, setView] = useKeptPick(project, 'view');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useKeptPick(project, 'ticket');
  const [narrowTicket, setNarrowTicket] = useState(false);
  const [dialog, setDialog] = useState<'follow' | 'manage' | 'switch'>();
  // Picking another tracker from a tracker's setup page.
  const [choosing, setChoosing] = useState(false);
  const data = list.data;
  const readAt = useReadAt(data);
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
  // Until one is picked, or once the picked one leaves the list, the first open ticket: done ones start collapsed in the list.
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
  const signIn = failing.filter((v) => v.connect);
  // Until the list reads, the tab speaks Jira's words, as before trackers.
  const tracker = data?.tracker ?? 'jira';
  const { Follow, Setup, name, nouns, unit, shortKey, connectPage } = TRACKERS[tracker];
  const refresh = () => void list.refresh();

  const choice = data && (choosing || (!data.tracker && !views.length));
  const unreachable = data?.connect !== undefined && connectPage;
  const setup = data && (choice || unreachable || !views.length);
  return (
    <div
      data-testid="tickets-tab"
      className={cn(
        'overflow-hidden rounded-xl border bg-card',
        // The list and the ticket fill the window and scroll on their own, so Start session stays in view.
        !setup && 'flex h-[calc(100vh-13rem)] min-h-[24rem] flex-col',
      )}
    >
      {choice ? (
        <TrackerChoice
          project={project}
          onChosen={async () => {
            setChoosing(false);
            await list.refresh();
            setDialog('follow');
          }}
        />
      ) : unreachable ? (
        <NotConnectedPanel
          tracker={tracker}
          following={views.length}
          onConnected={refresh}
          onElsewhere={() => setDialog('switch')}
        />
      ) : setup ? (
        <div className="grid justify-items-center pb-12">
          <Setup onFollow={() => setDialog('follow')} />
          <ElsewhereLink onClick={() => setChoosing(true)} />
        </div>
      ) : (
        <>
          <TicketsToolbar
            project={project}
            tracker={tracker}
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
              defaults: data?.defaults ?? DEFAULTS,
            }}
            onSettingsChanged={refresh}
            onSwitch={() => setDialog('switch')}
          />
          {signIn.length > 0 && (
            <SignInBanner
              tracker={tracker}
              views={signIn}
              notConnected={data?.connect !== undefined}
              onConnected={refresh}
            />
          )}
          {failing
            .filter((v) => !v.connect)
            .map((v) => (
              <div
                key={v.name}
                role="alert"
                className="mx-4 mt-3 rounded-lg bg-state-waiting/15 px-3 py-2 text-sm"
              >
                {v.name}: {v.error}
              </div>
            ))}
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div
              className={cn('min-h-0 overflow-auto md:border-r', narrowTicket && 'max-md:hidden')}
            >
              {tickets.length ? (
                <TicketList
                  tickets={tickets}
                  shortKey={shortKey}
                  selected={ticket?.key}
                  onSelect={(key) => {
                    setSelected(key);
                    setNarrowTicket(true);
                  }}
                />
              ) : (
                <Muted className="px-4 py-10 text-center">
                  {!data
                    ? `Reading ${name}...`
                    : (views.find((v) => v.name === current)?.note ??
                      (words ? `No ${nouns} match.` : `No ${nouns} in this ${unit}.`))}
                </Muted>
              )}
            </div>
            <div className={cn('flex min-h-0 flex-col', !narrowTicket && 'max-md:hidden')}>
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
        <Follow
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
          unit={unit}
          onChanged={refresh}
          onRenamed={(from, to) => view === from && setView(to)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'switch' && (
        <SwitchTrackerDialog
          project={project}
          tracker={tracker}
          onSwitched={() => {
            setDialog(undefined);
            refresh();
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
    </div>
  );
}
