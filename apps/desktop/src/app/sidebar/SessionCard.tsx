import type { TreeRow } from '@mesa/core';
import {
  GENERAL_PROJECT,
  projectLabel,
  sessionLabel,
  sessionTitle,
  WAITING_STATES,
} from '@mesa/core/browser';
import { ChevronsDown, ChevronsUp, Clock3, GitBranch, Plus, TerminalSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionLocation } from '../hooks/useStartSession';
import { HoverAction } from './HoverAction';
import { SessionCardMenu } from './SessionCardMenu';

/**
 * One session in the sidebar: its state and title, and while not compact its branch and state
 * line; on hover, a child session, compact, archive, and More actions.
 */
export function SessionCard(props: {
  session: TreeRow;
  selected: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  onSelect: () => void;
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
}) {
  const { session, selected, compact } = props;
  return (
    <div className="group relative mb-1">
      <button
        type="button"
        data-testid="sidebar-session"
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'flex w-full flex-col justify-center gap-1 rounded-md border border-border/70 bg-card/40 px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          compact ? 'min-h-9' : 'min-h-14',
          selected && 'border-ring bg-ring/15',
        )}
        title={`${projectLabel(session.project)}: ${sessionLabel(session)}: ${session.lastState.state}`}
        onClick={props.onSelect}
      >
        <span className="flex w-full min-w-0 items-center gap-2 font-medium">
          {session.managed && session.kind === 'terminal' ? (
            <TerminalSquare aria-hidden className="size-3.5 shrink-0 text-state-working" />
          ) : session.lastState.state === 'idle' ? (
            <Clock3 aria-hidden className="size-3.5 shrink-0 text-state-idle" />
          ) : (
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full border border-state-idle',
                WAITING_STATES.has(session.lastState.state) && 'border-state-waiting',
                session.lastState.state === 'working' && 'border-state-working',
                session.lastState.state === 'failed' && 'border-state-failed',
              )}
            />
          )}
          <span className="truncate">{sessionTitle(session)}</span>
        </span>
        {!compact && (
          <>
            {session.managed && session.worktree && (
              <span className="flex min-w-0 items-center gap-1 pl-4 font-mono text-[11px] text-state-working">
                <GitBranch aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{session.worktree.branch}</span>
              </span>
            )}
            <span
              className={cn(
                'pl-4 font-mono text-[11px] text-muted-foreground',
                WAITING_STATES.has(session.lastState.state) && 'text-state-waiting',
                session.lastState.state === 'failed' && 'text-state-failed',
              )}
            >
              {session.lastState.state}
            </span>
          </>
        )}
      </button>
      {session.managed && session.project !== GENERAL_PROJECT && (
        <HoverAction
          aria-label={`New child session from ${sessionTitle(session)} (${session.id})`}
          className="-left-2.5 rounded-full border bg-card"
          onClick={() => props.onNewSession?.(session.project, 'worktree', session.id)}
        >
          <Plus aria-hidden className="size-3.5" />
        </HoverAction>
      )}
      <HoverAction
        aria-label={`${compact ? 'Expand' : 'Compact'} ${sessionTitle(session)} card`}
        className="right-8"
        onClick={props.onToggleCompact}
      >
        {compact ? (
          <ChevronsDown aria-hidden className="size-3.5" />
        ) : (
          <ChevronsUp aria-hidden className="size-3.5" />
        )}
      </HoverAction>
      {session.managed && (
        <>
          <HoverAction
            aria-label={`Archive ${sessionTitle(session)} (${session.id})`}
            className="right-2"
            onClick={() => props.onArchiveSession?.(session.id)}
          >
            <X aria-hidden className="size-3.5" />
          </HoverAction>
          <SessionCardMenu
            session={session}
            onNewSession={props.onNewSession}
            onDependencySession={props.onDependencySession}
          />
        </>
      )}
    </div>
  );
}
