import type { TreeRow } from '@mesa/core';
import {
  GENERAL_PROJECT,
  projectLabel,
  sessionBranch,
  sessionLabel,
  sessionTitle,
} from '@mesa/core/browser';
import {
  ChevronsDown,
  ChevronsUp,
  Clock3,
  GitBranch,
  GitPullRequest,
  Moon,
  Plus,
  TerminalSquare,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { AutomationBanner } from '@/features/automations/AutomationBanner';
import { useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import type { SessionLocation } from '../start/useStartSession';
import { stateTone } from '../stateTone';
import { HoverAction } from './HoverAction';
import { SessionCardMenu } from './SessionCardMenu';

/**
 * A pull request's state as its colour, a tracker's open green and closed purple for open and
 * merged: draft muted, closed red.
 */
const PR_TONE = {
  open: 'text-issue-open',
  draft: 'text-muted-foreground',
  merged: 'text-issue-closed',
  closed: 'text-state-failed',
} as const;

/**
 * One session in the sidebar: its state and title with a badge per additional project, and while
 * not compact its branch with the lines its work added and removed, its state line, its agent's
 * progress line until it ends (when it was set in its tooltip), and its agent's last reply in one line (the whole stored reply in its tooltip); its branch's pull request
 * in its corner (on a compact card, on its title row, left of the hover actions while they show), a link that opens
 * it and never selects the card; while unread, filled green with a dot and a bold title.
 * Its children's rows (`crew`) sit inside its frame, below its own lines.
 * On hover, a child session, compact, archive, and More actions. Its keys: Arrows step to the
 * next card, Shift+Arrow ranges to it, Option+Arrow moves it within its project, and Shift+Enter or
 * Cmd+Enter act as a Shift- or Cmd-click.
 */
export function SessionCard(props: {
  session: TreeRow;
  /** The shown session's card. */
  selected: boolean;
  /** In the tab's multi-selection. */
  chosen: boolean;
  /** Finished work no one has looked at, or marked so (CONTEXT.md, Unread). */
  unread: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  /** A click, with Shift to range or Cmd to toggle. */
  onSelect: (keys: { shift: boolean; toggle: boolean }) => void;
  /** Arrow keys: focus the next (1) or previous (-1) card, with Shift ranging to it. */
  onStep: (by: 1 | -1, shift: boolean) => void;
  /** Option+Arrow: move it one place within its project; absent where cards keep their order. */
  onMove?: (by: 1 | -1) => void;
  /** How many cards are chosen when this one is, else 1. */
  chosenCount: number;
  onArchiveChosen: () => void;
  /** Marks this card, or every chosen card with it, unread or read. */
  onMarkChosen: (unread: boolean) => void;
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
  /** Its children's rows (WorkerRows), inside its frame below its own lines. */
  crew?: ReactNode;
}) {
  const { session, selected, chosen, compact, crew } = props;
  const branch = sessionBranch(session);
  const { unread } = props;
  const lines = session.managed ? session.lines : undefined;
  const reply = session.managed ? session.lastReply : undefined;
  const progress = session.managed && !session.endedAt ? session.progress : undefined;
  const pr = session.managed ? session.pr : undefined;
  const run = useRun();
  // The frame's colours, which a card with children shares with its rows below.
  const frame = cn(
    'border-border/70 bg-card/40',
    unread && 'border-state-unread',
    chosen && 'border-ring/60 bg-accent',
    selected && 'border-ring bg-ring/15',
    unread && 'bg-state-unread/25',
  );
  return (
    <div className="group relative mb-1">
      <div className="relative">
        <button
          type="button"
          data-testid="sidebar-session"
          data-session-id={session.id}
          data-chosen={chosen || undefined}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'flex w-full select-none flex-col justify-center gap-1 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
            compact ? 'min-h-9' : 'min-h-14',
            // The unread fill wins over the selection's, whose border still marks the card.
            frame,
            unread && 'hover:bg-state-unread/35',
            crew && 'rounded-b-none border-b-0',
          )}
          data-unread={unread || undefined}
          title={`${projectLabel(session.project)}: ${sessionLabel(session)}: ${session.lastState.state}${unread ? ', unread' : ''}${props.onMove ? '\nDrag or press Option+Up/Down to reorder' : ''}`}
          onClick={(event) => props.onSelect({ shift: event.shiftKey, toggle: event.metaKey })}
          onKeyDown={(event) => {
            const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
            const modified = event.key === 'Enter' && (event.shiftKey || event.metaKey);
            // Option+Arrow on a card that keeps its place is left to the browser.
            if ((!by && !modified) || (by && event.altKey && !props.onMove)) return;
            event.preventDefault();
            if (by && event.altKey) props.onMove?.(by);
            else if (by) props.onStep(by, event.shiftKey);
            else props.onSelect({ shift: event.shiftKey, toggle: event.metaKey });
          }}
        >
          {/* Clears the hover actions so the title never runs under them. */}
          <span
            className={cn(
              'flex w-full min-w-0 items-center gap-2 font-medium group-focus-within:pr-17 group-hover:pr-17',
              // Clears a compact card's pull request too, which sits on this row, left of the hover actions while they show.
              compact && pr && 'pr-14 group-focus-within:pr-30 group-hover:pr-30',
            )}
          >
            {unread ? (
              // Unread's own mark in place of the state's; the state line still names the state.
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-state-unread" />
            ) : session.managed && session.kind === 'terminal' ? (
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
            <span className={cn('truncate', unread && 'font-bold')}>{sessionTitle(session)}</span>
            {session.managed && session.sleeping && (
              <Badge
                variant="outline"
                data-testid="session-sleeping"
                title="Asleep: its agent quit to save memory; opening it wakes it"
                className="gap-1 px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
              >
                <Moon aria-hidden className="size-3" />
                Sleeping
              </Badge>
            )}
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
              {branch && (
                <span className="flex min-w-0 items-center gap-1 pl-4 font-mono text-[11px] text-state-working">
                  <GitBranch aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{branch}</span>
                  {lines && (
                    <span data-testid="session-lines" className="shrink-0">
                      <span className="text-state-idle">+{lines.added}</span>{' '}
                      <span className="text-state-failed">-{lines.removed}</span>
                    </span>
                  )}
                </span>
              )}
              <span
                className={cn(
                  'pl-4 font-mono text-[11px]',
                  stateTone(session.lastState.state).line,
                )}
              >
                {session.lastState.state}
                {unread && ' · unread'}
              </span>
              {progress && (
                <span
                  data-testid="session-progress"
                  title={`Set ${new Date(progress.at).toLocaleString()}`}
                  className={cn('truncate pl-4 text-[11px]', pr && !reply && 'pr-12')}
                >
                  {progress.text}
                </span>
              )}
              {reply && (
                <span
                  data-testid="session-reply"
                  title={reply.text}
                  className={cn('truncate pl-4 text-[11px] text-muted-foreground', pr && 'pr-12')}
                >
                  {reply.text.trimStart().split('\n', 1)[0]}
                </span>
              )}
            </>
          )}
          {compact && unread && <span className="sr-only">, unread</span>}
          {chosen && <span className="sr-only">, selected</span>}
        </button>
        {pr && (
          <button
            type="button"
            data-testid="session-pr"
            data-state={pr.state}
            aria-label={`Open pull request #${pr.number} (${pr.state})`}
            title={`Pull request #${pr.number}, ${pr.state}`}
            className={cn(
              'absolute right-2 flex items-center gap-0.5 rounded px-1 font-mono text-[10px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
              // A compact card's one row: it moves left of the hover actions while they show, still a link.
              compact
                ? 'top-1/2 -translate-y-1/2 group-focus-within:right-19 group-hover:right-19'
                : 'bottom-1.5',
              PR_TONE[pr.state],
            )}
            onClick={() => void run('browser.external', { url: pr.url })}
          >
            <GitPullRequest aria-hidden className="size-3" />#{pr.number}
          </button>
        )}
      </div>
      {crew && <div className={cn('rounded-b-md border border-t-0 pb-1', frame)}>{crew}</div>}
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
            unread={unread}
            onNewSession={props.onNewSession}
            onDependencySession={props.onDependencySession}
            chosenCount={props.chosenCount}
            onArchiveChosen={props.onArchiveChosen}
            onMarkChosen={props.onMarkChosen}
          />
        </>
      )}
    </div>
  );
}
