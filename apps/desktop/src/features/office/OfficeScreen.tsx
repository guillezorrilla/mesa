import type { ProjectRow, TreeRow } from '@mesa/core';
import {
  doingNow,
  FINAL_STATES,
  reportedState,
  sessionDetail,
  sessionTitle,
  WAITING_STATES,
} from '@mesa/core/browser';
import { useEffect, useMemo, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { StateBadge } from '@/features/sessions/StateBadge';
import { OfficeCanvas } from './OfficeCanvas';
import { officeRooms } from './officeLayout';
import { officePose } from './officePose';
import './office.css';

/**
 * The Office (CONTEXT.md, Office): the board's sessions as pixel characters, one room per
 * project. For fun: it shows what the board already knows and decides nothing. A desk opens its
 * session; pointing at one, or tabbing to it, reads its details in the strip below.
 */
export function OfficeScreen(props: {
  sessions: readonly TreeRow[];
  projects: readonly ProjectRow[] | undefined;
  onSession: (id: string) => void;
}) {
  const { sessions } = props;
  const rooms = useMemo(
    () => officeRooms(sessions, props.projects ?? []),
    [sessions, props.projects],
  );
  const [peeked, setPeeked] = useState<string>();
  // The building is as wide as the pane allows: two screen pixels to an art pixel, 16 to a tile.
  const [holder, setHolder] = useState<HTMLElement | null>(null);
  const [maxCols, setMaxCols] = useState(40);
  useEffect(() => {
    if (!holder || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(() =>
      setMaxCols(Math.max(24, Math.floor(holder.clientWidth / 32))),
    );
    watch.observe(holder);
    return () => watch.disconnect();
  }, [holder]);
  const peek = sessions.find((row) => row.id === peeked);
  const doing = peek && (doingNow(peek) ?? (peek.managed ? peek.lastOutput : undefined));
  const seated = rooms.flatMap((room) => room.desks.map((desk) => reportedState(desk.row)));
  const count = (states: ReadonlySet<string>) => seated.filter((state) => states.has(state)).length;
  const working = count(new Set(['working']));
  const waiting = count(WAITING_STATES);
  const ended = count(FINAL_STATES);
  return (
    <div data-testid="office-screen" className="flex min-h-full flex-col">
      <PageHeader title="Office" description="Every session at its seat, one room per project.">
        {seated.length > 0 && (
          <p data-testid="office-summary" className="text-muted-foreground text-sm">
            {[
              `${working} working`,
              `${waiting} need you`,
              `${seated.length - working - waiting - ended} resting`,
              ...(ended ? [`${ended} ended`] : []),
            ].join(' · ')}
          </p>
        )}
      </PageHeader>
      {rooms.length === 0 ? (
        <Muted>Nobody is in. Start a session and it takes a desk.</Muted>
      ) : (
        <div ref={setHolder} className="flex-1 overflow-x-auto">
          <OfficeCanvas
            rooms={rooms}
            maxCols={maxCols}
            onOpen={props.onSession}
            onPeek={setPeeked}
          />
        </div>
      )}
      <div
        data-testid="office-details"
        className="sticky bottom-0 mt-4 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 text-sm"
      >
        {peek ? (
          <>
            <StateBadge state={reportedState(peek)} />
            <span className="font-medium">{sessionTitle(peek)}</span>
            <span className="text-muted-foreground">{officePose(peek).says}</span>
            <span className="font-mono text-muted-foreground text-xs">{sessionDetail(peek)}</span>
            {doing && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{doing}</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Point at a desk to see what its agent is doing; click it to open the session.
          </span>
        )}
      </div>
    </div>
  );
}
