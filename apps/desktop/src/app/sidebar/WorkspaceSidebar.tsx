import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder,
  GitPullRequest,
  Library,
  type LucideIcon,
  Map as MapIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ResizeHandle } from '@/components/ResizeHandle';
import { Button } from '@/components/ui/button';
import { usePendingRuns } from '@/features/automations/usePendingRuns';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { ProjectsSection } from '@/features/projects/ProjectsSection';
import { ReviewsSection } from '@/features/prs/ReviewsSection';
import { liveReviews } from '@/features/prs/reviewSessions';
import { useSharedPrs } from '@/features/prs/usePrs';
import { COMMAND_ICONS } from '@/features/search/hitIcon';
import { useSessionSelection } from '@/features/sessions/selection/useSessionSelection';
import { SessionsSection } from '@/features/sessions/sidebar/SessionsSection';
import { sidebarGroups, sidebarOrder } from '@/features/sessions/sidebar/sidebarGroups';
import { useUnfoldOnNewSession } from '@/features/sessions/sidebar/useUnfoldOnNewSession';
import type { SessionLocation } from '@/features/sessions/start/useStartSession';
import type { PrRef } from '@/lib/client/prs';
import { useKeptWidth } from '@/lib/useKeptWidth';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/lib/workspaceView';
import { SidebarNavButton } from './SidebarNavButton';
import { type SidebarTab, SidebarTabs } from './SidebarTabs';

/** The expanded sidebar's width bounds, default, and arrow-key step, in pixels. */
const SIDEBAR_WIDTH = { min: 200, max: 480, initial: 264, step: 16 };

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
  onProjectsChanged: () => void;
  onProjectUnregistered: (name: string) => void;
  /** The session and project last shown: the Sessions and Projects tabs go back to them. */
  lastSession?: string;
  lastProject?: string;
  /** The pull request last shown: the Reviews tab goes back to it while it is still listed. */
  lastPr?: PrRef;
  /** Sessions starting, by project (GENERAL_PROJECT for General), shown until they open. */
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  /** Archives the selected sessions together, after one confirmation. */
  onArchiveSessions?: (ids: string[]) => void;
  /** Resumes every recoverable session. */
  onRestoreAll?: () => void;
  onDependencySession?: (id: string) => void;
  /** Puts a project's session cards in a new order (useReorderSessions). */
  onReorderSessions?: (project: string, ids: string[]) => void;
}) {
  const { view, onView, collapsed } = props;
  const [closedProjects, setClosedProjects] = useState<string[]>([]);
  const [compactSessions, setCompactSessions] = useState<string[]>([]);
  const [tab, setTab] = useState<SidebarTab>('sessions');
  // The app's one read of every project's PRs, so the tab can count them before it opens.
  const prs = useSharedPrs();
  const [width, setWidth] = useKeptWidth('mesa.sidebar.width', SIDEBAR_WIDTH);
  useEffect(() => {
    if (view.kind === 'project') setTab('projects');
    if (view.kind === 'session' || view.kind === 'sessions') setTab('sessions');
    if (view.kind === 'prs-setup' || view.kind === 'pr') setTab('reviews');
  }, [view.kind]);
  const groups = sidebarGroups(props.projects, props.sessions);
  const { visible, active, stranded } = groups;
  const order = sidebarOrder(groups, closedProjects);
  useUnfoldOnNewSession(active, setClosedProjects);
  const selection = useSessionSelection(order, view.kind === 'session' ? view.id : undefined);
  /** The Sessions tab, back on the session last shown while it is still listed, else the first. */
  const openSessions = () => {
    setTab('sessions');
    if (view.kind === 'session') return;
    const listed = [...active, ...stranded];
    const back = listed.find((session) => session.id === props.lastSession) ?? listed[0];
    onView(back ? { kind: 'session', id: back.id } : { kind: 'sessions' });
  };
  /** The Projects tab, back on the project last shown while it is still listed. */
  const openProjects = () => {
    setTab('projects');
    const last = visible.find((project) => project.name === props.lastProject);
    if (last && view.kind !== 'project') onView({ kind: 'project', name: last.name });
  };
  /** The Reviews tab, back on the pull request last shown while it is still listed. */
  const openReviews = () => {
    setTab('reviews');
    const last = props.lastPr;
    const listed = prs?.list.data?.prs.some(
      (pr) => pr.project === last?.project && pr.number === last?.number,
    );
    if (last && listed && view.kind !== 'pr') onView({ kind: 'pr', ...last });
  };
  const pendingRuns = usePendingRuns();
  const nav = (label: string, icon: LucideIcon, target: WorkspaceView, count = 0) => (
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
      // The Sessions tab's empty space gives the keyboard back to the open session.
      data-returns-focus={tab === 'sessions' || undefined}
      className={cn('relative flex shrink-0 flex-col border-r bg-card/50', collapsed && 'w-14')}
      style={collapsed ? undefined : { width }}
    >
      {!collapsed && (
        <ResizeHandle
          label="Resize sidebar"
          edge="right"
          width={width}
          bounds={SIDEBAR_WIDTH}
          onWidth={setWidth}
        />
      )}
      <div className="flex h-12 items-center border-b px-2">
        {!collapsed && (
          <SidebarTabs
            tab={tab}
            sessionCount={active.length + stranded.length}
            waiting={props.waiting}
            reviewCount={prs?.toAct ?? 0}
            onSessions={openSessions}
            onProjects={openProjects}
            onReviews={openReviews}
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
            {nav('Sessions', COMMAND_ICONS.sessions, { kind: 'sessions' })}
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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reviews"
              title="Reviews"
              onClick={() => {
                openReviews();
                props.onCollapse();
              }}
            >
              <GitPullRequest aria-hidden className="size-4" />
            </Button>
          </div>
        ) : tab === 'reviews' ? (
          prs && (
            <ReviewsSection
              prs={prs}
              onSetup={(row) => onView({ kind: 'prs-setup', project: row.project })}
              onOpen={(pr) => onView({ kind: 'pr', project: pr.project, number: pr.number })}
              current={view.kind === 'pr' ? view : undefined}
              reviewing={liveReviews(props.sessions)}
            />
          )
        ) : tab === 'projects' ? (
          <ProjectsSection
            projects={visible}
            touching={groups.touching}
            view={view}
            onView={onView}
            sort={props.sort}
            onSort={props.onSort}
            onAddProject={props.onAddProject}
            onProjectsChanged={props.onProjectsChanged}
            onProjectUnregistered={props.onProjectUnregistered}
          />
        ) : (
          <SessionsSection
            groups={groups}
            onBoard={props.sessions.map((session) => session.id)}
            order={order}
            view={view}
            onView={onView}
            closedProjects={closedProjects}
            onToggleProject={(name) => setClosedProjects((current) => toggled(current, name))}
            compactSessions={compactSessions}
            onToggleCompact={(id) => setCompactSessions((current) => toggled(current, id))}
            chosen={selection.ids}
            onSelection={selection.apply}
            onArchiveSessions={props.onArchiveSessions}
            onRestoreAll={props.onRestoreAll}
            starting={props.starting}
            onNewSession={props.onNewSession}
            onArchiveSession={props.onArchiveSession}
            onDependencySession={props.onDependencySession}
            onReorder={props.onReorderSessions}
          />
        )}
      </nav>
      <div className="flex flex-wrap justify-around border-t px-2 py-2">
        {nav('Grid', COMMAND_ICONS.grid, { kind: 'grid' })}
        {nav('Vault', Library, { kind: 'vault' })}
        {nav('Map', MapIcon, { kind: 'map' })}
        {nav('Daily', Clock3, { kind: 'daily' })}
        {nav('Automations', COMMAND_ICONS.automations, { kind: 'automations' }, pendingRuns)}
        {nav('Doctor', COMMAND_ICONS.doctor, { kind: 'doctor' })}
        {nav('Shortcuts', COMMAND_ICONS.shortcuts, { kind: 'shortcuts' })}
      </div>
    </aside>
  );
}
