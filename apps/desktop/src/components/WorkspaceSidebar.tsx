import type { ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Folder,
  Grid2X2,
  Keyboard,
  LayoutDashboard,
  Plus,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkspaceView =
  | { kind: 'board' | 'grid' | 'projects' | 'doctor' | 'help' | 'shortcuts' }
  | { kind: 'project'; name: string }
  | { kind: 'session'; id: string };

/** Project and session navigation for the active profile. Session state still comes from the Board. */
export function WorkspaceSidebar(props: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  projects: readonly ProjectRow[];
  sessions: readonly TreeRow[];
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const { view, onView, collapsed } = props;
  const visible = props.projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  const active = props.sessions.filter(
    (session) => !['done', 'failed', 'stopped'].includes(session.lastState.state),
  );
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const projectTab = view.kind === 'project' || view.kind === 'projects';
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
    <button
      key={session.id}
      type="button"
      data-testid="sidebar-session"
      aria-current={view.kind === 'session' && view.id === session.id ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
        view.kind === 'session' && view.id === session.id && 'bg-accent',
      )}
      title={`${session.project ?? 'General'}: ${sessionLabel(session)}: ${session.lastState.state}`}
      onClick={() => onView({ kind: 'session', id: session.id })}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full bg-state-idle',
          session.lastState.state.startsWith('waiting') && 'bg-state-waiting',
          session.lastState.state === 'working' && 'bg-state-working',
          session.lastState.state === 'failed' && 'bg-state-failed',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{sessionLabel(session)}</span>
    </button>
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
              onClick={() => onView({ kind: 'board' })}
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
                  visible[0] ? { kind: 'project', name: visible[0].name } : { kind: 'projects' },
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
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Sessions
              </span>
              <div className="flex gap-1">
                {item('Board', LayoutDashboard, { kind: 'board' })}
                {item('Grid', Grid2X2, { kind: 'grid' })}
              </div>
            </div>
            {visible.map((project) => (
              <div key={project.name} className="mb-3">
                <button
                  type="button"
                  data-testid="sidebar-project"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                  onClick={() => onView({ kind: 'project', name: project.name })}
                >
                  <Folder aria-hidden className="size-3.5" />
                  <span className="truncate">{project.label}</span>
                </button>
                <div className="ml-3 border-l pl-1">
                  {active.filter((session) => session.project === project.name).map(sessionItem)}
                </div>
              </div>
            ))}
            {unassigned.length > 0 && (
              <div>
                <p className="px-2 text-xs text-muted-foreground">General and other</p>
                <div className="ml-3 border-l pl-1">{unassigned.map(sessionItem)}</div>
              </div>
            )}
            {active.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No active sessions</p>
            )}
          </>
        )}
      </nav>
      <div className="flex justify-around border-t px-2 py-2">
        {item('Projects', Folder, { kind: 'projects' })}
        {item('Doctor', Stethoscope, { kind: 'doctor' })}
        {item('Shortcuts', Keyboard, { kind: 'shortcuts' })}
        {item('Help', CircleHelp, { kind: 'help' })}
      </div>
    </aside>
  );
}
