import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { useRef } from 'react';
import { Muted } from '@/components/Muted';
import type { SessionLocation } from '../hooks/useStartSession';
import type { WorkspaceView } from '../navigation';
import { ProjectSessionsGroup } from './ProjectSessionsGroup';
import { SessionCard } from './SessionCard';
import { SessionsMenu } from './SessionsMenu';
import { StartingSessions } from './StartingSessions';
import type { SelectionInput } from './sessionSelection';
import type { SidebarGroups } from './sidebarGroups';

/**
 * The Sessions tab: active sessions by project, then General, Other, and Recoverable, as one
 * multi-selection that the right-click menu or a chosen card's More menu archives.
 */
export function SessionsSection(props: {
  groups: SidebarGroups;
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
}) {
  const { groups, view, onView } = props;
  const { visible, active, stranded, general, other, inProject } = groups;
  const { chosen, onSelection, order } = props;
  const list = useRef<HTMLDivElement>(null);
  /** Focuses the card `by` places from `id`, Shift-clicking it with `shift`; none past either end. */
  const step = (id: string, by: number, shift: boolean) => {
    const next = order[order.indexOf(id) + by];
    if (!next) return;
    list.current?.querySelector<HTMLElement>(`[data-session-id="${next}"]`)?.focus();
    if (shift) onSelection({ kind: 'click', id: next, shift: true, from: id });
  };
  const card = (session: TreeRow) => {
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
          chosenCount={count}
          onArchiveChosen={archive}
          onNewSession={props.onNewSession}
          onArchiveSession={props.onArchiveSession}
          onDependencySession={props.onDependencySession}
        />
      </SessionsMenu>
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
      {visible.map((project) => (
        <ProjectSessionsGroup
          key={project.name}
          project={project}
          closed={props.closedProjects.includes(project.name)}
          onToggle={() => props.onToggleProject(project.name)}
          starting={props.starting}
          onNewSession={props.onNewSession}
        >
          {inProject(project.name).map(card)}
        </ProjectSessionsGroup>
      ))}
      {(general.length > 0 || props.starting?.includes(GENERAL_PROJECT)) && (
        <div>
          <Muted size="xs" className="px-2">
            General
          </Muted>
          <div className="px-1">
            {general.map(card)}
            <StartingSessions project={GENERAL_PROJECT} starting={props.starting} />
          </div>
        </div>
      )}
      {other.length > 0 && (
        <div>
          <Muted size="xs" className="px-2">
            Other
          </Muted>
          <div className="px-1">{other.map(card)}</div>
        </div>
      )}
      {stranded.length > 0 && (
        <div data-testid="recoverable-sessions" className="mt-4">
          <p className="px-2 text-xs font-medium text-state-waiting">Recoverable</p>
          <div className="px-1">{stranded.map(card)}</div>
        </div>
      )}
      {active.length + stranded.length === 0 && (
        <Muted size="xs" className="px-2">
          No active sessions
        </Muted>
      )}
    </div>
  );
}
