import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder,
  Grid2X2,
  Keyboard,
  Library,
  Map as MapIcon,
  Stethoscope,
  TerminalSquare,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePendingRuns } from '@/features/automations/usePendingRuns';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { cn } from '@/lib/utils';
import type { SessionLocation } from '../hooks/useStartSession';
import type { WorkspaceView } from '../navigation';
import { ProjectsSection } from './ProjectsSection';
import { SessionsSection } from './SessionsSection';
import { SidebarNavButton } from './SidebarNavButton';
import { SidebarTabs } from './SidebarTabs';
import { sidebarGroups, sidebarOrder } from './sidebarGroups';
import { useSessionSelection } from './useSessionSelection';

/** `list` with `value` added, or removed when it is there. */
const toggled = (list: string[], value: string) =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

/** Project and session navigation for the active profile. Session state comes from the shared session workspace. */
export function WorkspaceSidebar(props: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  projects: readonly ProjectRow[];
  sessions: readonly TreeRow[];
  /** The visual alert's count (0 when it is off): the Sessions tab shows a dot while it is above 0. */
  waiting: number;
  collapsed: boolean;
  onCollapse: () => void;
  sort: ProjectSort;
  onSort: (sort: ProjectSort) => void;
  onAddProject: (request: ProjectAddRequest) => void;
  /** The session and project last shown: the Sessions and Projects tabs go back to them. */
  lastSession?: string;
  lastProject?: string;
  /** Sessions starting, by project (GENERAL_PROJECT for General), shown until they open. */
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  /** Archives the selected sessions together, after one confirmation. */
  onArchiveSessions?: (ids: string[]) => void;
  onDependencySession?: (id: string) => void;
}) {
  const { view, onView, collapsed } = props;
  const [closedProjects, setClosedProjects] = useState<string[]>([]);
  const [compactSessions, setCompactSessions] = useState<string[]>([]);
  const [projectTab, setProjectTab] = useState(false);
  useEffect(() => {
    if (view.kind === 'project') setProjectTab(true);
    if (view.kind === 'session' || view.kind === 'sessions') setProjectTab(false);
  }, [view.kind]);
  const groups = sidebarGroups(props.projects, props.sessions);
  const { visible, active, stranded } = groups;
  const selection = useSessionSelection(
    sidebarOrder(groups, closedProjects),
    view.kind === 'session' ? view.id : undefined,
  );
  /** The Sessions tab, back on the session last shown while it is still listed, else the first. */
  const openSessions = () => {
    setProjectTab(false);
    if (view.kind === 'session') return;
    const listed = [...active, ...stranded];
    const back = listed.find((session) => session.id === props.lastSession) ?? listed[0];
    onView(back ? { kind: 'session', id: back.id } : { kind: 'sessions' });
  };
  /** The Projects tab, back on the project last shown while it is still listed. */
  const openProjects = () => {
    setProjectTab(true);
    const last = visible.find((project) => project.name === props.lastProject);
    if (last && view.kind !== 'project') onView({ kind: 'project', name: last.name });
  };
  const pendingRuns = usePendingRuns();
  const nav = (label: string, icon: typeof TerminalSquare, target: WorkspaceView, count = 0) => (
    <SidebarNavButton
      label={label}
      icon={icon}
      target={target}
      view={view}
      onView={onView}
      count={count}
    />
  );
  return (
    <aside
      data-testid="workspace-sidebar"
      data-collapsed={collapsed}
      className={cn('flex shrink-0 flex-col border-r bg-card/50', collapsed ? 'w-14' : 'w-[264px]')}
    >
      <div className="flex h-12 items-center border-b px-2">
        {!collapsed && (
          <SidebarTabs
            projectTab={projectTab}
            sessionCount={active.length + stranded.length}
            waiting={props.waiting}
            onSessions={openSessions}
            onProjects={openProjects}
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={props.onCollapse}
        >
          {collapsed ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
        </Button>
      </div>
      <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {collapsed ? (
          <div className="space-y-1">
            {nav('Sessions', TerminalSquare, { kind: 'sessions' })}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Projects"
              title="Projects"
              onClick={() => {
                openProjects();
                props.onCollapse();
              }}
            >
              <Folder aria-hidden className="size-4" />
            </Button>
          </div>
        ) : projectTab ? (
          <ProjectsSection
            projects={visible}
            inProject={groups.inProject}
            view={view}
            onView={onView}
            sort={props.sort}
            onSort={props.onSort}
            onAddProject={props.onAddProject}
          />
        ) : (
          <SessionsSection
            groups={groups}
            view={view}
            onView={onView}
            closedProjects={closedProjects}
            onToggleProject={(name) => setClosedProjects((current) => toggled(current, name))}
            compactSessions={compactSessions}
            onToggleCompact={(id) => setCompactSessions((current) => toggled(current, id))}
            chosen={selection.ids}
            onSelection={selection.apply}
            onArchiveSessions={props.onArchiveSessions}
            starting={props.starting}
            onNewSession={props.onNewSession}
            onArchiveSession={props.onArchiveSession}
            onDependencySession={props.onDependencySession}
          />
        )}
      </nav>
      <div className="flex flex-wrap justify-around border-t px-2 py-2">
        {nav('Grid', Grid2X2, { kind: 'grid' })}
        {nav('Vault', Library, { kind: 'vault' })}
        {nav('Map', MapIcon, { kind: 'map' })}
        {nav('Daily', Clock3, { kind: 'daily' })}
        {nav('Automations', CalendarClock, { kind: 'automations' }, pendingRuns)}
        {nav('Doctor', Stethoscope, { kind: 'doctor' })}
        {nav('Shortcuts', Keyboard, { kind: 'shortcuts' })}
      </div>
    </aside>
  );
}
