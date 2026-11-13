import type { TreeRow } from '@mesa/core';
import { crewTitle, doingNow, reportedState, shortAgo } from '@mesa/core/browser';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StateIcon } from '../StateIcon';
import { useUnreadContext } from '../useUnread';

const SETUP_FAILED = 'Setup failed, click to open its Setup session';

import type { NestedRow } from './sidebarGroups';

/**
 * A session's children inside its sidebar card (CONTEXT.md, Crew), one button each: the state
 * it reported (reportedState) as an icon, its task's title (crewTitle), how long ago its state
 * changed, and what it is doing now (doingNow), filled and bold while unread, as a card is; a
 * click opens it. A failed setup shows as a red
 * mark that opens its Setup session: the card's own above the rows, a row's beside its time while
 * the worker has not settled (done or failed).
 */
export function WorkerRows(props: {
  /** The card's session. */
  owner: string;
  rows: readonly NestedRow[];
  /** A session's failed Setup sessions. */
  failedSetupsOf: (id: string) => readonly TreeRow[];
  /** The shown session's id. */
  selected?: string;
  onOpen: (id: string) => void;
}) {
  const now = Date.now();
  const unreadContext = useUnreadContext();
  /** A row's mark is the warning icon alone, so its title keeps the room; the card's says so. */
  const marks = (owner: string, worded = false) =>
    props.failedSetupsOf(owner).map((setup) => (
      <button
        key={setup.id}
        type="button"
        data-testid="setup-failed"
        aria-label={SETUP_FAILED}
        title={SETUP_FAILED}
        className="pointer-events-auto flex items-center gap-1 rounded px-0.5 font-mono text-[10px] text-state-failed hover:bg-state-failed/15 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => props.onOpen(setup.id)}
      >
        <TriangleAlert aria-hidden className="size-3" />
        {worded && 'setup failed'}
      </button>
    ));
  return (
    <ul aria-label="Workers" className="mx-1 border-t border-border/60 pt-1">
      {marks(props.owner).length > 0 && (
        <li className="flex flex-col items-start pb-1 pl-3">{marks(props.owner, true)}</li>
      )}
      {props.rows.map(({ session, depth }) => {
        const title = crewTitle(session);
        const doing = doingNow(session);
        const shown = reportedState(session);
        const unread = unreadContext?.unread(session) ?? false;
        // A worker that settled (done or failed) has no setup left to worry about.
        const setups = shown === 'done' || shown === 'failed' ? [] : marks(session.id);
        return (
          <li key={session.id} className="relative min-w-0">
            <button
              type="button"
              data-testid="sidebar-worker"
              data-session-id={session.id}
              aria-current={props.selected === session.id ? 'page' : undefined}
              data-unread={unread || undefined}
              title={`Open ${title}${unread ? ', unread' : ''}`}
              style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
              className={cn(
                'grid w-full min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] items-center gap-x-2 rounded py-1 pr-1.5 text-left text-[11px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                props.selected === session.id && 'bg-ring/15',
                // The unread fill wins over the selection's, as on a card.
                unread && 'bg-state-unread/25 hover:bg-state-unread/35',
              )}
              onClick={() => props.onOpen(session.id)}
            >
              <StateIcon state={shown} />
              {/* Clears the time, and the setup mark, which sit over this line's end. */}
              <span
                className={cn('truncate', setups.length ? 'pr-15' : 'pr-10', unread && 'font-bold')}
              >
                {title}
              </span>
              {doing && (
                <span
                  data-testid="worker-doing"
                  className="col-start-2 truncate font-mono text-[10px] text-muted-foreground"
                >
                  {doing}
                </span>
              )}
            </button>
            <span className="pointer-events-none absolute top-1 right-1.5 flex items-center gap-1.5">
              {setups}
              <span
                title={new Date(session.lastState.at).toLocaleString()}
                className="font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {shortAgo(session.lastState.at, now)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
