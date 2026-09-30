import type { ProjectRow, TreeRow } from '@mesa/core';
import {
  GENERAL_PROJECT,
  projectLabel,
  sessionLabel,
  sessionTitle,
  WAITING_STATES,
} from '@mesa/core/browser';
import {
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CircleHelp,
  Clock3,
  Folder,
  GitBranch,
  Grid2X2,
  Keyboard,
  LayoutDashboard,
  Library,
  MoreVertical,
  Plus,
  Settings2,
  Stethoscope,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { exited, queued, recoverable } from '@/screens/board/rows';

export type WorkspaceView =
  | {
      kind:
        | 'board'
        | 'grid'
        | 'projects'
        | 'doctor'
        | 'help'
        | 'shortcuts'
        | 'preferences'
        | 'prompts'
        | 'backup'
        | 'tour'
        | 'usage'
        | 'inbox';
    }
  | { kind: 'vault'; query?: string }
  | { kind: 'project'; name: string; file?: { checkout: string; path: string; line: number } }
  | { kind: 'session'; id: string };

/** Project and session navigation for the active profile. Session state still comes from the Board. */
export function WorkspaceSidebar(props: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  projects: readonly ProjectRow[];
  sessions: readonly TreeRow[];
  collapsed: boolean;
  onCollapse: () => void;
  onNewSession?: (project: string, kind: 'main' | 'worktree' | 'terminal', parent?: string) => void;
  onArchiveSession?: (id: string) => void;
  onDependencySession?: (id: string) => void;
}) {
  const { view, onView, collapsed } = props;
  const [closedProjects, setClosedProjects] = useState<string[]>([]);
  const [compactSessions, setCompactSessions] = useState<string[]>([]);
  const lastProject = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (view.kind === 'project') lastProject.current = view.name;
  }, [view]);
  const visible = props.projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  const active = props.sessions.filter(
    (session) => session.managed && (!exited(session) || queued(session)),
  );
  const stranded = props.sessions.filter(recoverable);
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const general = unassigned.filter((session) => session.project === GENERAL_PROJECT);
  const other = unassigned.filter((session) => session.project !== GENERAL_PROJECT);
  const projectTab = view.kind === 'project' || view.kind === 'projects';
  const selectedProject =
    visible.find((project) => project.name === lastProject.current) ?? visible[0];
  const item = (label: string, icon: typeof LayoutDashboard, target: WorkspaceView) => {
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
                const first = view.kind === 'session' ? view.id : (active[0] ?? stranded[0])?.id;
                onView(first ? { kind: 'session', id: first } : { kind: 'board' });
              }}
            >
              Sessions{' '}
              <span className="rounded bg-muted px-1">{active.length + stranded.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={projectTab}
              className={cn(
                'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
                projectTab && 'border-ring text-foreground',
              )}
              onClick={() =>
                onView(
                  selectedProject
                    ? { kind: 'project', name: selectedProject.name }
                    : { kind: 'projects' },
                )
              }
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
            {item('Board', LayoutDashboard, { kind: 'board' })}
            {item('Projects', Folder, { kind: 'projects' })}
          </div>
        ) : projectTab ? (
          <>
            <div className="mb-2 flex items-center justify-between px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Recent</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add or manage projects"
                onClick={() => onView({ kind: 'projects' })}
              >
                <Plus aria-hidden />
              </Button>
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
                    aria-label={`${closedProjects.includes(project.name) ? 'Expand' : 'Collapse'} ${project.label} sessions`}
                    aria-expanded={!closedProjects.includes(project.name)}
                    className="rounded p-1 hover:bg-accent"
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
                  </button>
                  <button
                    type="button"
                    data-testid="sidebar-project"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left hover:text-foreground"
                    onClick={() => onView({ kind: 'project', name: project.name })}
                  >
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
              </div>
            ))}
            {general.length > 0 && (
              <div>
                <p className="px-2 text-xs text-muted-foreground">General</p>
                <div className="px-1">{general.map(sessionItem)}</div>
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
        {item('Board', LayoutDashboard, { kind: 'board' })}
        {item('Grid', Grid2X2, { kind: 'grid' })}
        {item('Projects', Folder, { kind: 'projects' })}
        {item('Vault', Library, { kind: 'vault' })}
        {item('Usage', ChartNoAxesCombined, { kind: 'usage' })}
        {item('Inbox', Bell, { kind: 'inbox' })}
        {item('Doctor', Stethoscope, { kind: 'doctor' })}
        {item('Preferences', Settings2, { kind: 'preferences' })}
        {item('Shortcuts', Keyboard, { kind: 'shortcuts' })}
        {item('Help', CircleHelp, { kind: 'help' })}
      </div>
    </aside>
  );
}
