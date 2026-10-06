import type { ManagedRow, TreeRow } from '@mesa/core';
import {
  activeSession,
  contextPercent,
  duration,
  sessionBranch,
  sessionTitle,
} from '@mesa/core/browser';
import { Clock3, GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/SectionLabel';
import { Badge } from '@/components/ui/badge';
import { StateBadge } from '@/features/sessions/StateBadge';
import { FromProjectBadge } from './FromProjectBadge';

/** The project's running and queued sessions, a card each, with the quick start under them. */
export function ActiveSessions(props: {
  project: string;
  sessions: readonly (TreeRow & ManagedRow)[];
  /** The main checkout's branch, for a session that does not name its own. */
  mainBranch?: string;
  onSession: (id: string) => void;
  children: ReactNode;
}) {
  const activeSessions = props.sessions.filter(activeSession);
  return (
    <section className="space-y-3">
      <SectionLabel>
        Active{' '}
        <Badge variant="secondary" className="ml-1 bg-state-idle/20 text-state-idle">
          {activeSessions.length}
        </Badge>
      </SectionLabel>
      <div className="flex max-w-[960px] flex-wrap gap-3">
        {activeSessions.map((session) => (
          <button
            key={session.id}
            type="button"
            data-testid="project-active-session"
            aria-label={`Open ${sessionTitle(session)} (${session.id})`}
            className="flex min-h-24 w-[310px] flex-col items-start gap-1 rounded-lg border bg-card/65 p-3 text-left hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => props.onSession(session.id)}
          >
            <span className="flex items-center gap-1">
              <StateBadge state={session.lastState.state} compact />
              <FromProjectBadge session={session} project={props.project} />
            </span>
            <span className="w-full truncate text-sm font-medium">{sessionTitle(session)}</span>
            <span className="flex w-full min-w-0 items-center gap-1 truncate font-mono text-xs text-state-working">
              <GitBranch aria-hidden className="size-3" />{' '}
              {sessionBranch(session) ?? props.mainBranch ?? 'branch unknown'}
            </span>
            <span className="mt-auto flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {session.context ? `${contextPercent(session.context.used)}%` : 'Context unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Clock3 aria-hidden className="size-3" />
                {duration(session.runningSeconds)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {props.children}
    </section>
  );
}
