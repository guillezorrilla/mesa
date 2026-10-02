import type { TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { Muted } from '@/components/Muted';
import type { SessionLocation } from '../hooks/useStartSession';
import type { WorkspaceView } from '../navigation';
import { ProjectSessionsGroup } from './ProjectSessionsGroup';
import { SessionCard } from './SessionCard';
import { StartingSessions } from './StartingSessions';
import type { SidebarGroups } from './sidebarGroups';

/** The Sessions tab: active sessions by project, then General, Other, and Recoverable. */
export function SessionsSection(props: {
  groups: SidebarGroups;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  /** Projects whose session cards are folded away. */
  closedProjects: readonly string[];
  onToggleProject: (name: string) => void;
  /** Sessions whose cards show only their title. */
  compactSessions: readonly string[];
  onToggleCompact: (id: string) => void;
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
}) {
  const { groups, view, onView } = props;
  const { visible, active, stranded, general, other } = groups;
  const card = (session: TreeRow) => (
    <SessionCard
      key={session.id}
      session={session}
      selected={view.kind === 'session' && view.id === session.id}
      compact={props.compactSessions.includes(session.id)}
      onToggleCompact={() => props.onToggleCompact(session.id)}
      onSelect={() => onView({ kind: 'session', id: session.id })}
      onNewSession={props.onNewSession}
      onArchiveSession={props.onArchiveSession}
      onDependencySession={props.onDependencySession}
    />
  );
  return (
    <>
      {visible.map((project) => (
        <ProjectSessionsGroup
          key={project.name}
          project={project}
          closed={props.closedProjects.includes(project.name)}
          onToggle={() => props.onToggleProject(project.name)}
          starting={props.starting}
          onNewSession={props.onNewSession}
        >
          {active.filter((session) => session.project === project.name).map(card)}
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
    </>
  );
}
