import type { ManagedRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { exited, queued } from '@/features/sessions/rows';
import { NativeHistory } from '../NativeHistory';
import { FromProjectBadge } from './FromProjectBadge';
import type { OverviewState } from './useOverviewState';

/** The project's ended sessions, newest first, and its native history on request. */
export function RecentSessions(props: {
  project: string;
  sessions: readonly (TreeRow & ManagedRow)[];
  state: OverviewState;
  onSession: (id: string) => void;
}) {
  const { historyOpen, setHistoryOpen } = props.state;
  const recentSessions = props.sessions.filter((s) => exited(s) && !queued(s));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>
          Recent{' '}
          <Badge variant="secondary" className="ml-1">
            {recentSessions.length}
          </Badge>
        </SectionLabel>
        <Button size="sm" variant="ghost" onClick={() => setHistoryOpen((open) => !open)}>
          {historyOpen ? 'Hide' : 'Native history'}
        </Button>
      </div>
      {historyOpen && (
        <NativeHistory key={props.project} project={props.project} onSession={props.onSession} />
      )}
      {recentSessions.map((session) => (
        <button
          key={session.id}
          type="button"
          data-testid="project-recent-session"
          className="flex w-full items-center gap-3 border-b py-2 text-left text-sm hover:text-primary"
          onClick={() => props.onSession(session.id)}
        >
          <Badge variant="outline">{session.lastState.state}</Badge>
          <span>{sessionLabel(session)}</span>
          <FromProjectBadge session={session} project={props.project} />
          <span className="ml-auto text-xs text-muted-foreground">{session.agent}</span>
        </button>
      ))}
      {props.sessions.length === 0 && <Muted>No sessions for this project yet.</Muted>}
    </section>
  );
}
