import type { TreeRow } from '@mesa/core';
import { crewTitle, doingNow, shortAgo } from '@mesa/core/browser';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StateIcon } from '../StateIcon';
import type { NestedRow } from './sidebarGroups';

/**
 * A session's children inside its sidebar card (CONTEXT.md, Crew), one button each: its state
 * icon, its task's title (crewTitle), how long ago its state changed, and what it is doing now
 * (doingNow); a click opens it. A failed setup shows as a red mark that opens its Setup session:
 * the card's own first, then each row's below it.
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
  const marks = (owner: string) =>
    props.failedSetupsOf(owner).map((setup) => (
      <button
        key={setup.id}
        type="button"
        data-testid="setup-failed"
        title="Its worktree setup failed: open the Setup session"
        className="ml-4 flex items-center gap-1 self-start rounded px-1 py-0.5 font-mono text-[10px] text-state-failed hover:bg-state-failed/15 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => props.onOpen(setup.id)}
      >
        <TriangleAlert aria-hidden className="size-3" />
        setup failed
      </button>
    ));
  return (
    <ul aria-label="Workers" className="mx-1 border-t border-border/60 pt-1">
      {marks(props.owner).length > 0 && <li className="flex flex-col">{marks(props.owner)}</li>}
      {props.rows.map(({ session, depth }) => {
        const title = crewTitle(session);
        const doing = doingNow(session);
        return (
          <li key={session.id} className="flex min-w-0 flex-col">
            <button
              type="button"
              data-testid="sidebar-worker"
              data-session-id={session.id}
              aria-current={props.selected === session.id ? 'page' : undefined}
              title={`Open ${title}`}
              style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
              className={cn(
                'grid w-full min-w-0 grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded py-1 pr-1.5 text-left text-[11px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                props.selected === session.id && 'bg-ring/15',
              )}
              onClick={() => props.onOpen(session.id)}
            >
              <StateIcon state={session.lastState.state} />
              <span className="truncate">{title}</span>
              <span
                title={new Date(session.lastState.at).toLocaleString()}
                className="font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {shortAgo(session.lastState.at, now)}
              </span>
              {doing && (
                <span
                  data-testid="worker-doing"
                  className="col-start-2 col-end-4 truncate font-mono text-[10px] text-muted-foreground"
                >
                  {doing}
                </span>
              )}
            </button>
            {marks(session.id)}
          </li>
        );
      })}
    </ul>
  );
}
