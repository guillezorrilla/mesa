import type { ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FolderGit2,
  Grid2X2,
  Keyboard,
  LayoutDashboard,
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
  const unassigned = props.sessions.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const item = (label: string, icon: typeof LayoutDashboard, target: WorkspaceView) => {
    const Icon = icon;
    return (
      <Button
        variant="ghost"
        size="sm"
        data-testid={`nav-${label.toLowerCase()}`}
        className={cn('w-full justify-start', collapsed && 'justify-center px-0')}
        aria-label={label}
        aria-current={view.kind === target.kind ? 'page' : undefined}
        title={collapsed ? label : undefined}
        onClick={() => onView(target)}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        {!collapsed && label}
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
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
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
      className={cn('flex shrink-0 flex-col border-r bg-card/60', collapsed ? 'w-14' : 'w-60')}
    >
      <div className="flex h-14 items-center justify-between border-b px-2">
        {!collapsed && <span className="px-2 font-semibold tracking-tight">Workspace</span>}
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={props.onCollapse}
        >
          {collapsed ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
        </Button>
      </div>
      <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {item('Board', LayoutDashboard, { kind: 'board' })}
          {item('Grid', Grid2X2, { kind: 'grid' })}
          {item('Projects', FolderGit2, { kind: 'projects' })}
        </div>
        {!collapsed && (
          <div className="mt-6 space-y-3">
            <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Projects and sessions
            </p>
            {visible.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">No visible projects</p>
            )}
            {visible.map((project) => (
              <div key={project.name}>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="sidebar-project"
                  className={cn(
                    'w-full justify-start truncate font-medium',
                    view.kind === 'project' && view.name === project.name && 'bg-accent',
                  )}
                  aria-current={
                    view.kind === 'project' && view.name === project.name ? 'page' : undefined
                  }
                  title={project.path}
                  onClick={() => onView({ kind: 'project', name: project.name })}
                >
                  <FolderGit2 aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{project.label}</span>
                </Button>
                <div className="ml-3 border-l pl-2">
                  {props.sessions
                    .filter((session) => session.project === project.name)
                    .map(sessionItem)}
                </div>
              </div>
            ))}
            {unassigned.length > 0 && (
              <div>
                <p className="px-2 text-xs font-medium text-muted-foreground">General and other</p>
                <div className="ml-3 border-l pl-2">{unassigned.map(sessionItem)}</div>
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="space-y-1 border-t px-2 py-2">
        {item('Doctor', Stethoscope, { kind: 'doctor' })}
        {item('Shortcuts', Keyboard, { kind: 'shortcuts' })}
        {item('Help', CircleHelp, { kind: 'help' })}
      </div>
    </aside>
  );
}
