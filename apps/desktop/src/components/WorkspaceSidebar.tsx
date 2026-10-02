import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import {
  GENERAL_PROJECT,
  projectLabel,
  sessionLabel,
  sessionTitle,
  WAITING_STATES,
} from '@mesa/core/browser';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock3,
  Folder,
  FolderPlus,
  GitBranch,
  Grid2X2,
  Keyboard,
  Library,
  LoaderCircle,
  Map as MapIcon,
  MoreVertical,
  Plus,
  Stethoscope,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AddProjectMenu, type ProjectAddRequest } from '@/components/AddProjectMenu';
import { ProjectSortMenu } from '@/components/ProjectSortMenu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { activeSession, recoverable } from '@/screens/board/rows';

export type WorkspaceView =
  | {
      kind:
        | 'sessions'
        | 'grid'
        | 'doctor'
        | 'help'
        | 'shortcuts'
        | 'preferences'
        | 'prompts'
        | 'backup'
        | 'tour'
        | 'map'
        | 'usage'
        | 'inbox';
    }
  | { kind: 'daily' }
  /** The Vault screen, searching `query` or with the item at `path` selected, when given. */
  | { kind: 'vault'; query?: string; path?: string }
  | { kind: 'project'; name: string; file?: { checkout: string; path: string; line: number } }
  | { kind: 'session'; id: string };

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
  onNewSession?: (project: string, kind: 'main' | 'worktree' | 'terminal', parent?: string) => void;
  onArchiveSession?: (id: string) => void;
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
  const visible = props.projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  const active = props.sessions.filter(activeSession);
  const stranded = props.sessions.filter(recoverable);
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const general = unassigned.filter((session) => session.project === GENERAL_PROJECT);
  /** The Projects tab, back on the project last shown while it is still listed. */
  const openProjects = () => {
    setProjectTab(true);
    const last = visible.find((project) => project.name === props.lastProject);
    if (last && view.kind !== 'project') onView({ kind: 'project', name: last.name });
  };
  const startingIn = (project: string) =>
    (props.starting ?? [])
      .filter((name) => name === project)
      .map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, one per start
          key={i}
          role="status"
          data-testid="starting-session"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
        >
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Starting session
        </div>
      ));
  const other = unassigned.filter((session) => session.project !== GENERAL_PROJECT);
  const item = (label: string, icon: typeof TerminalSquare, target: WorkspaceView) => {
    const Icon = icon;
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid={`nav-${label.toLowerCase()}`}
        aria-label={label}
        aria-current={view.kind === target.kind ? 'page' : undefined}
        title={label}
        onClick={() => onView(target)}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
      </Button>
    );
  };
  const sessionItem = (session: TreeRow) => (
    <div key={session.id} className="group relative mb-1">
      <button
        type="button"
        data-testid="sidebar-session"
        aria-current={view.kind === 'session' && view.id === session.id ? 'page' : undefined}
        className={cn(
          'flex w-full flex-col justify-center gap-1 rounded-md border border-border/70 bg-card/40 px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          compactSessions.includes(session.id) ? 'min-h-9' : 'min-h-14',
          view.kind === 'session' && view.id === session.id && 'border-ring bg-ring/15',
        )}
        title={`${projectLabel(session.project)}: ${sessionLabel(session)}: ${session.lastState.state}`}
        onClick={() => onView({ kind: 'session', id: session.id })}
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
        {!compactSessions.includes(session.id) && (
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
        <button
          type="button"
          aria-label={`New child session from ${sessionTitle(session)} (${session.id})`}
          className="pointer-events-none absolute -left-2.5 top-2 rounded-full border bg-card p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          onClick={() => props.onNewSession?.(session.project, 'worktree', session.id)}
        >
          <Plus aria-hidden className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={`${compactSessions.includes(session.id) ? 'Expand' : 'Compact'} ${sessionTitle(session)} card`}
        className="pointer-events-none absolute right-8 top-2 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        onClick={() =>
          setCompactSessions((current) =>
            current.includes(session.id)
              ? current.filter((id) => id !== session.id)
              : [...current, session.id],
          )
        }
      >
        {compactSessions.includes(session.id) ? (
          <ChevronsDown aria-hidden className="size-3.5" />
        ) : (
          <ChevronsUp aria-hidden className="size-3.5" />
        )}
      </button>
      {session.managed && (
        <>
          <button
            type="button"
            aria-label={`Archive ${sessionTitle(session)} (${session.id})`}
            className="pointer-events-none absolute right-2 top-2 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            onClick={() => props.onArchiveSession?.(session.id)}
          >
            <X aria-hidden className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More actions for ${sessionTitle(session)} (${session.id})`}
                className="pointer-events-none absolute right-14 top-2 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100"
              >
                <MoreVertical aria-hidden className="size-3.5" />
              </button>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
  return (
    <aside
      data-testid="workspace-sidebar"
      data-collapsed={collapsed}
      className={cn('flex shrink-0 flex-col border-r bg-card/50', collapsed ? 'w-14' : 'w-[264px]')}
    >
      <div className="flex h-12 items-center border-b px-2">
        {!collapsed && (
          <div role="tablist" aria-label="Workspace" className="flex min-w-0 flex-1">
            <button
              type="button"
              role="tab"
              aria-selected={!projectTab}
              className={cn(
                'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
                !projectTab && 'border-ring text-foreground',
              )}
              onClick={() => {
                setProjectTab(false);
                if (view.kind === 'session') return;
                const listed = [...active, ...stranded];
                const back =
                  listed.find((session) => session.id === props.lastSession) ?? listed[0];
                onView(back ? { kind: 'session', id: back.id } : { kind: 'sessions' });
              }}
            >
              Sessions{' '}
              <span className="rounded bg-muted px-1">{active.length + stranded.length}</span>
              {props.waiting > 0 && (
                <span
                  data-testid="sessions-waiting"
                  role="img"
                  aria-label={`${props.waiting} waiting for input`}
                  className="ml-1 inline-block size-2 rounded-full bg-state-waiting align-middle"
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={projectTab}
              className={cn(
                'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
                projectTab && 'border-ring text-foreground',
              )}
              onClick={openProjects}
            >
              Projects
            </button>
          </div>
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
            {item('Sessions', TerminalSquare, { kind: 'sessions' })}
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
          <>
            <AddProjectMenu onSelect={props.onAddProject}>
              <Button
                variant="ghost"
                className="mb-4 w-full justify-start"
                aria-label="Add project"
              >
                <FolderPlus aria-hidden className="size-4" /> Add project
                <ChevronRight aria-hidden className="ml-auto size-4" />
              </Button>
            </AddProjectMenu>
            <div className="mb-2 flex items-center justify-between px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Your projects</span>
              <ProjectSortMenu sort={props.sort} onSort={props.onSort} />
            </div>
            {visible.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No visible projects</p>
            )}
            {visible.map((project) => (
              <Button
                key={project.name}
                variant="ghost"
                size="sm"
                data-testid="sidebar-project"
                className={cn(
                  'w-full justify-start truncate text-xs',
                  view.kind === 'project' && view.name === project.name && 'bg-accent',
                )}
                aria-current={
                  view.kind === 'project' && view.name === project.name ? 'page' : undefined
                }
                title={project.path}
                onClick={() => onView({ kind: 'project', name: project.name })}
              >
                <Folder aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{project.label}</span>
                <span className="ml-auto text-muted-foreground">
                  {active.filter((session) => session.project === project.name).length || ''}
                </span>
              </Button>
            ))}
          </>
        ) : (
          <>
            {visible.map((project) => (
              <div key={project.name} className="mb-3">
                <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    data-testid="sidebar-project"
                    aria-label={`${closedProjects.includes(project.name) ? 'Expand' : 'Collapse'} ${project.label} sessions`}
                    aria-expanded={!closedProjects.includes(project.name)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() =>
                      setClosedProjects((current) =>
                        current.includes(project.name)
                          ? current.filter((name) => name !== project.name)
                          : [...current, project.name],
                      )
                    }
                  >
                    {closedProjects.includes(project.name) ? (
                      <ChevronRight aria-hidden className="size-3" />
                    ) : (
                      <ChevronDown aria-hidden className="size-3" />
                    )}
                    <Folder aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">{project.label}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        aria-label={`New session in ${project.label}`}
                      >
                        <Plus aria-hidden className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-52">
                      {(['main', 'terminal', 'worktree'] as const).map((kind) => (
                        <DropdownMenuItem
                          key={kind}
                          className="text-xs"
                          onSelect={() => props.onNewSession?.(project.name, kind)}
                        >
                          {kind === 'terminal' ? (
                            <TerminalSquare aria-hidden className="size-3.5" />
                          ) : (
                            <Plus aria-hidden className="size-3.5" />
                          )}
                          {kind === 'main'
                            ? 'New session'
                            : kind === 'terminal'
                              ? 'New terminal session'
                              : 'New worktree session'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!closedProjects.includes(project.name) && (
                  <div className="mt-1 space-y-1 px-1">
                    {active.filter((session) => session.project === project.name).map(sessionItem)}
                  </div>
                )}
                {startingIn(project.name)}
              </div>
            ))}
            {(general.length > 0 || props.starting?.includes(GENERAL_PROJECT)) && (
              <div>
                <p className="px-2 text-xs text-muted-foreground">General</p>
                <div className="px-1">
                  {general.map(sessionItem)}
                  {startingIn(GENERAL_PROJECT)}
                </div>
              </div>
            )}
            {other.length > 0 && (
              <div>
                <p className="px-2 text-xs text-muted-foreground">Other</p>
                <div className="px-1">{other.map(sessionItem)}</div>
              </div>
            )}
            {stranded.length > 0 && (
              <div data-testid="recoverable-sessions" className="mt-4">
                <p className="px-2 text-xs font-medium text-state-waiting">Recoverable</p>
                <div className="px-1">{stranded.map(sessionItem)}</div>
              </div>
            )}
            {active.length + stranded.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No active sessions</p>
            )}
          </>
        )}
      </nav>
      <div className="flex flex-wrap justify-around border-t px-2 py-2">
        {item('Grid', Grid2X2, { kind: 'grid' })}
        {item('Vault', Library, { kind: 'vault' })}
        {item('Map', MapIcon, { kind: 'map' })}
        {item('Daily', Clock3, { kind: 'daily' })}
        {item('Doctor', Stethoscope, { kind: 'doctor' })}
        {item('Shortcuts', Keyboard, { kind: 'shortcuts' })}
      </div>
    </aside>
  );
}
