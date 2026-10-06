import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, projectLabel, sessionLabel, sessionTitle } from '@mesa/core/browser';
import { ChevronsDown, ChevronsUp, Clock3, GitBranch, Plus, TerminalSquare, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AutomationBanner } from '@/features/automations/AutomationBanner';
import { cn } from '@/lib/utils';
import type { SessionLocation } from '../start/useStartSession';
import { stateTone } from '../stateTone';
import { HoverAction } from './HoverAction';
import { SessionCardMenu } from './SessionCardMenu';

/**
 * One session in the sidebar: its state and title with a badge per additional project, and while
 * not compact its branch and state line; on hover, a child session, compact, archive, and More
 * actions. Its keys: Arrows step to the next card, Shift+Arrow ranges to it, and Shift+Enter or
 * Cmd+Enter act as a Shift- or Cmd-click.
 */
export function SessionCard(props: {
  session: TreeRow;
  /** The shown session's card. */
  selected: boolean;
  /** In the tab's multi-selection. */
  chosen: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  /** A click, with Shift to range or Cmd to toggle. */
  onSelect: (keys: { shift: boolean; toggle: boolean }) => void;
  /** Arrow keys: focus the next (1) or previous (-1) card, with Shift ranging to it. */
  onStep: (by: 1 | -1, shift: boolean) => void;
  /** How many cards are chosen when this one is, else 1. */
  chosenCount: number;
  onArchiveChosen: () => void;
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
}) {
  const { session, selected, chosen, compact } = props;
  return (
    <div className="group relative mb-1">
      <button
        type="button"
        data-testid="sidebar-session"
        data-session-id={session.id}
        data-chosen={chosen || undefined}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'flex w-full select-none flex-col justify-center gap-1 rounded-md border border-border/70 bg-card/40 px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          compact ? 'min-h-9' : 'min-h-14',
          chosen && 'border-ring/60 bg-accent',
          selected && 'border-ring bg-ring/15',
        )}
        title={`${projectLabel(session.project)}: ${sessionLabel(session)}: ${session.lastState.state}`}
        onClick={(event) => props.onSelect({ shift: event.shiftKey, toggle: event.metaKey })}
        onKeyDown={(event) => {
          const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          const modified = event.key === 'Enter' && (event.shiftKey || event.metaKey);
          if (!by && !modified) return;
          event.preventDefault();
          if (by) props.onStep(by, event.shiftKey);
          else props.onSelect({ shift: event.shiftKey, toggle: event.metaKey });
        }}
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
                'size-2 shrink-0 rounded-full border',
                stateTone(session.lastState.state).dot,
              )}
            />
          )}
          <span className="truncate">{sessionTitle(session)}</span>
          {session.managed &&
            session.additional?.map(({ project }) => (
              <Badge
                key={project}
                variant="outline"
                data-testid={`session-additional-${project}`}
                title={`Also in ${projectLabel(project)}`}
                className="px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
              >
                +{project}
              </Badge>
            ))}
        </span>
        {session.managed && session.automation && (
          <AutomationBanner rule={session.automation.rule} />
        )}
        {!compact && (
          <>
            {session.managed && session.worktree && (
              <span className="flex min-w-0 items-center gap-1 pl-4 font-mono text-[11px] text-state-working">
                <GitBranch aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{session.worktree.branch}</span>
              </span>
            )}
            <span
              className={cn('pl-4 font-mono text-[11px]', stateTone(session.lastState.state).line)}
            >
              {session.lastState.state}
            </span>
          </>
        )}
        {chosen && <span className="sr-only">, selected</span>}
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
            chosenCount={props.chosenCount}
            onArchiveChosen={props.onArchiveChosen}
          />
        </>
      )}
    </div>
  );
}
