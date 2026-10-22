import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, moveSession } from '@mesa/core/browser';
import { RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { WorkspaceView } from '@/lib/workspaceView';
import type { SelectionInput } from '../selection/sessionSelection';
import { StartingSessions } from '../start/StartingSessions';
import type { SessionLocation } from '../start/useStartSession';
import { ArchivedSection } from './ArchivedSection';
import { ProjectSessionsGroup } from './ProjectSessionsGroup';
import { SessionCard } from './SessionCard';
import { SessionsMenu } from './SessionsMenu';
import { SortableCard, SortableCards } from './SortableCards';
import type { SidebarGroups } from './sidebarGroups';

/**
 * The Sessions tab: active sessions by project, then General, Other, and Recoverable, as one
 * multi-selection that the right-click menu or a chosen card's More menu archives, and the
 * Archived section at the bottom. A project's cards reorder within it, dragged or with
 * Option+Arrow.
 */
export function SessionsSection(props: {
  groups: SidebarGroups;
  /** The ids of the sessions on the board, which the Archived section watches. */
  onBoard: readonly string[];
  /** The cards' rendered order (sidebarOrder), which the arrow keys step through. */
  order: readonly string[];
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  /** Projects whose session cards are folded away. */
  closedProjects: readonly string[];
  onToggleProject: (name: string) => void;
  /** Sessions whose cards show only their title. */
  compactSessions: readonly string[];
  onToggleCompact: (id: string) => void;
  /** The selected sessions, in selection order. */
  chosen: readonly string[];
  onSelection: (input: SelectionInput) => void;
  onArchiveSessions?: (ids: string[]) => void;
  /** Recoverable's Restore all: resumes every recoverable session. */
  onRestoreAll?: () => void;
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
  /** Saves a project's cards in a new order. */
  onReorder?: (project: string, ids: string[]) => void;
}) {
  const { groups, view, onView } = props;
  const { byActivity, active, stranded, general, other, inProject } = groups;
  const { chosen, onSelection, order } = props;
  const list = useRef<HTMLDivElement>(null);
  /** Focuses the card `by` places from `id`, Shift-clicking it with `shift`; none past either end. */
  const step = (id: string, by: number, shift: boolean) => {
    const next = order[order.indexOf(id) + by];
    if (!next) return;
    list.current?.querySelector<HTMLElement>(`[data-session-id="${next}"]`)?.focus();
    if (shift) onSelection({ kind: 'click', id: next, shift: true, from: id });
  };
  /** A card; with `onMove`, Option+Arrow moves it within its project. */
  const card = (session: TreeRow, onMove?: (by: 1 | -1) => void) => {
    const count = chosen.includes(session.id) ? chosen.length : 1;
    const archive = () => props.onArchiveSessions?.(count > 1 ? [...chosen] : [session.id]);
    return (
      <SessionsMenu
        key={session.id}
        count={count}
        onOpen={() => onSelection({ kind: 'context', id: session.id })}
        onArchive={archive}
      >
        <SessionCard
          session={session}
          selected={view.kind === 'session' && view.id === session.id}
          chosen={chosen.includes(session.id)}
          compact={props.compactSessions.includes(session.id)}
          onToggleCompact={() => props.onToggleCompact(session.id)}
          onSelect={(keys) => {
            onSelection({ kind: 'click', id: session.id, ...keys });
            if (!keys.shift && !keys.toggle) onView({ kind: 'session', id: session.id });
          }}
          onStep={(by, shift) => step(session.id, by, shift)}
          onMove={onMove}
          chosenCount={count}
          onArchiveChosen={archive}
          onNewSession={props.onNewSession}
          onArchiveSession={props.onArchiveSession}
          onDependencySession={props.onDependencySession}
        />
      </SessionsMenu>
    );
  };
  /**
   * A project's cards: two or more reorder among themselves, dragged (SortableCards) or with
   * Option+Arrow, and save the new order; one alone is a plain card.
   */
  const projectCards = (project: string, sessions: readonly TreeRow[]) => {
    if (sessions.length < 2) return sessions.map((session) => card(session));
    const ids = sessions.map((session) => session.id);
    const reorder = (next: string[]) => props.onReorder?.(project, next);
    const move = (id: string) => (by: 1 | -1) => {
      const at = ids.indexOf(id) + by;
      if (at >= 0 && at < ids.length) reorder(moveSession(ids, id, at));
    };
    return (
      <SortableCards ids={ids} onReorder={reorder}>
        {sessions.map((session) => (
          <SortableCard key={session.id} id={session.id}>
            {card(session, move(session.id))}
          </SortableCard>
        ))}
      </SortableCards>
    );
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups cards.
    <div
      ref={list}
      role="group"
      aria-label="Sessions"
      onKeyDown={(event) => {
        // An open menu's Escape bubbles here through React's tree, though its DOM is elsewhere.
        if (event.key === 'Escape' && event.currentTarget.contains(event.target as Node))
          onSelection({ kind: 'escape' });
      }}
    >
      {byActivity.map((project) => {
        const cards = inProject(project.name);
        return (
          <ProjectSessionsGroup
            key={project.name}
            project={project}
            closed={props.closedProjects.includes(project.name)}
            count={cards.length}
            onToggle={() => props.onToggleProject(project.name)}
            starting={props.starting}
            onNewSession={props.onNewSession}
          >
            {projectCards(project.name, cards)}
          </ProjectSessionsGroup>
        );
      })}
      {(general.length > 0 || props.starting?.includes(GENERAL_PROJECT)) && (
        <div>
          <Muted size="xs" className="px-2">
            General
          </Muted>
          <div className="px-1">
            {general.map((session) => card(session))}
            <StartingSessions project={GENERAL_PROJECT} starting={props.starting} />
          </div>
        </div>
      )}
      {other.length > 0 && (
        <div>
          <Muted size="xs" className="px-2">
            Other
          </Muted>
          <div className="px-1">{other.map((session) => card(session))}</div>
        </div>
      )}
      {stranded.length > 0 && (
        <div data-testid="recoverable-sessions" className="mt-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-medium text-state-waiting">Recoverable</p>
            {props.onRestoreAll && (
              <Button variant="ghost" size="xs" onClick={props.onRestoreAll}>
                <RotateCcw aria-hidden /> Restore all
              </Button>
            )}
          </div>
          <div className="px-1">{stranded.map((session) => card(session))}</div>
        </div>
      )}
      {active.length + stranded.length === 0 && (
        <Muted size="xs" className="px-2">
          No active sessions
        </Muted>
      )}
      <ArchivedSection
        onBoard={props.onBoard}
        onSelectSession={(id) => onView({ kind: 'session', id })}
      />
    </div>
  );
}
