import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, moveSession } from '@mesa/core/browser';
import { useRef } from 'react';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/lib/workspaceView';
import type { SelectionInput } from '../selection/sessionSelection';
import { StartingSessions } from '../start/StartingSessions';
import type { SessionLocation } from '../start/useStartSession';
import { ArchivedSection } from './ArchivedSection';
import { ProjectSessionsGroup } from './ProjectSessionsGroup';
import { SessionCard } from './SessionCard';
import { SessionsMenu } from './SessionsMenu';
import type { SidebarGroups } from './sidebarGroups';
import { useCardDrag } from './useCardDrag';

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
  /** The project whose card is pressed, so a drop saves that project's order. */
  const pressed = useRef('');
  const drag = useCardDrag((ids) => props.onReorder?.(pressed.current, ids));
  /** Focuses the card `by` places from `id`, Shift-clicking it with `shift`; none past either end. */
  const step = (id: string, by: number, shift: boolean) => {
    const next = order[order.indexOf(id) + by];
    if (!next) return;
    list.current?.querySelector<HTMLElement>(`[data-session-id="${next}"]`)?.focus();
    if (shift) onSelection({ kind: 'click', id: next, shift: true, from: id });
  };
  /** A project's card, in `rail` with its siblings' ids, moves among them; any other stays put. */
  const card = (session: TreeRow, rail?: { project: string; ids: string[] }) => {
    const count = chosen.includes(session.id) ? chosen.length : 1;
    const archive = () => props.onArchiveSessions?.(count > 1 ? [...chosen] : [session.id]);
    /** Option+Arrow: one place up or down its rail, keeping focus, as the card stays mounted. */
    const move =
      rail && rail.ids.length > 1
        ? (by: 1 | -1) => {
            const at = rail.ids.indexOf(session.id) + by;
            if (at >= 0 && at < rail.ids.length)
              props.onReorder?.(rail.project, moveSession(rail.ids, session.id, at));
          }
        : undefined;
    const menu = (
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
          onMove={move}
          chosenCount={count}
          onArchiveChosen={archive}
          onNewSession={props.onNewSession}
          onArchiveSession={props.onArchiveSession}
          onDependencySession={props.onDependencySession}
        />
      </SessionsMenu>
    );
    if (!move || !rail) return menu;
    const lifted = drag.dragging === session.id;
    return (
      <div
        key={session.id}
        data-drag-id={session.id}
        data-dragging={lifted || undefined}
        className={cn('rounded-md', lifted && 'scale-[1.02] opacity-95 shadow-lg')}
        style={drag.style(session.id)}
        onPointerDown={(event) => {
          pressed.current = rail.project;
          drag.start(event);
        }}
      >
        {menu}
      </div>
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
        const rail = { project: project.name, ids: cards.map((session) => session.id) };
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
            {cards.map((session) => card(session, rail))}
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
          <p className="px-2 text-xs font-medium text-state-waiting">Recoverable</p>
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
