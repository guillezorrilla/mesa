import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, sessionTitle } from '@mesa/core/browser';
import { Archive, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SessionLocation } from '../hooks/useStartSession';
import { HoverAction } from './HoverAction';

/**
 * A managed session card's More actions: a terminal or child worktree session from it, a
 * dependency, and while several cards are chosen with it, archiving them together.
 */
export function SessionCardMenu(props: {
  session: Extract<TreeRow, { managed: true }>;
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onDependencySession?: (id: string) => void;
  /** How many cards are chosen when this one is, else 1. */
  chosenCount: number;
  onArchiveChosen: () => void;
}) {
  const { session } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HoverAction
          aria-label={`More actions for ${sessionTitle(session)} (${session.id})`}
          className="right-14 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100"
        >
          <MoreVertical aria-hidden className="size-3.5" />
        </HoverAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem
          onSelect={() => props.onNewSession?.(session.project, 'terminal', session.id)}
        >
          New terminal session
        </DropdownMenuItem>
        {session.project !== GENERAL_PROJECT && (
          <DropdownMenuItem
            onSelect={() => props.onNewSession?.(session.project, 'worktree', session.id)}
          >
            New child worktree session
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => props.onDependencySession?.(session.id)}>
          Set dependency
        </DropdownMenuItem>
        {props.chosenCount > 1 && (
          <DropdownMenuItem onSelect={props.onArchiveChosen}>
            <Archive aria-hidden />
            Archive {props.chosenCount} sessions
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
