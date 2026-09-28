import type { ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel, WAITING_STATES } from '@mesa/core/browser';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Folder,
  Grid2X2,
  Keyboard,
  LayoutDashboard,
  Plus,
  Stethoscope,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { exited, queued } from '@/screens/board/rows';

export type WorkspaceView =
  | { kind: 'board' | 'grid' | 'projects' | 'doctor' | 'help' | 'shortcuts' }
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
  onNewSession?: (project: string, kind: 'main' | 'worktree' | 'terminal') => void;
  onArchiveSession?: (id: string) => void;
}) {
  const { view, onView, collapsed } = props;
  const [closedProjects, setClosedProjects] = useState<string[]>([]);
  const lastProject = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (view.kind === 'project') lastProject.current = view.name;
  }, [view]);
  const visible = props.projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  const active = props.sessions.filter((session) => !exited(session) || queued(session));
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
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
    <div key={session.id} className="group relative">
      <button
        type="button"
        data-testid="sidebar-session"
        aria-current={view.kind === 'session' && view.id === session.id ? 'page' : undefined}
        className={cn(
          'mb-1 flex min-h-14 w-full flex-col justify-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          view.kind === 'session' &&
            view.id === session.id &&
            'border-state-waiting bg-state-waiting/15',
        )}
        title={`${session.project ?? 'General'}: ${sessionLabel(session)}: ${session.lastState.state}`}
        onClick={() => onView({ kind: 'session', id: session.id })}
      >
        <span className="flex w-full min-w-0 items-center gap-2 font-medium">
          {session.managed && session.kind === 'terminal' ? (
            <TerminalSquare aria-hidden className="size-3.5 shrink-0 text-state-working" />
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
          <span className="truncate">
            {session.managed && !session.name ? 'Session' : sessionLabel(session)}
          </span>
        </span>
        <span
          className={cn(
            'pl-4 font-mono text-[11px] text-muted-foreground',
            session.lastState.state === 'working' && 'text-state-working',
            WAITING_STATES.has(session.lastState.state) && 'text-state-waiting',
            session.lastState.state === 'failed' && 'text-state-failed',
          )}
        >
          {session.lastState.state}
        </span>
      </button>
      {session.managed && (
        <button
          type="button"
          aria-label={`Archive ${session.name ?? 'Session'} (${session.id})`}
          className="absolute right-2 top-2 hidden rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:block group-hover:block"
          onClick={() => props.onArchiveSession?.(session.id)}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
  return (
    <aside
      data-testid="workspace-sidebar"
      data-collapsed={collapsed}
      className={cn('flex shrink-0 flex-col border-r bg-card/50', collapsed ? 'w-14' : 'w-64')}
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
                !projectTab && 'border-primary text-foreground',
              )}
              onClick={() => {
                const first = view.kind === 'session' ? view.id : active[0]?.id;
                onView(first ? { kind: 'session', id: first } : { kind: 'board' });
              }}
            >
              Sessions <span className="rounded bg-muted px-1">{active.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={projectTab}
              className={cn(
                'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
                projectTab && 'border-primary text-foreground',
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
                  <details className="relative">
                    <summary
                      aria-label={`New session in ${project.label}`}
                      className="flex size-6 cursor-pointer items-center justify-center rounded hover:bg-accent"
                    >
                      <Plus aria-hidden className="size-3.5" />
                    </summary>
                    <div className="absolute left-full top-0 z-30 ml-1 w-52 rounded-md border bg-popover p-1 shadow-lg">
                      {(['main', 'terminal', 'worktree'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                          onClick={(event) => {
                            const menu = event.currentTarget.closest('details');
                            if (menu) menu.open = false;
                            props.onNewSession?.(project.name, kind);
                          }}
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
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
                {!closedProjects.includes(project.name) && (
                  <div className="mt-1 space-y-1 px-1">
                    {active.filter((session) => session.project === project.name).map(sessionItem)}
                  </div>
                )}
              </div>
            ))}
            {unassigned.length > 0 && (
              <div>
                <p className="px-2 text-xs text-muted-foreground">General and other</p>
                <div className="px-1">{unassigned.map(sessionItem)}</div>
              </div>
            )}
            {active.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No active sessions</p>
            )}
          </>
        )}
      </nav>
      <div className="flex justify-around border-t px-2 py-2">
        {item('Board', LayoutDashboard, { kind: 'board' })}
        {item('Grid', Grid2X2, { kind: 'grid' })}
        {item('Projects', Folder, { kind: 'projects' })}
        {item('Doctor', Stethoscope, { kind: 'doctor' })}
        {item('Shortcuts', Keyboard, { kind: 'shortcuts' })}
        {item('Help', CircleHelp, { kind: 'help' })}
      </div>
    </aside>
  );
}
