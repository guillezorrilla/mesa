import type { TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { useState } from 'react';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { WorkspaceSidebar, type WorkspaceView } from './components/WorkspaceSidebar';
import { useCommand } from './lib/useCommand';
import { BoardScreen } from './screens/board/BoardScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspace } from './screens/ProjectWorkspace';

export function App() {
  const [view, setView] = useState<WorkspaceView>({ kind: 'board' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const doctor = useCommand('doctor.run');
  const projects = useCommand('projects.list');
  const project =
    view.kind === 'project' ? projects.data?.find((p) => p.name === view.name) : undefined;
  const selectedSession =
    view.kind === 'session' ? sessions.find((session) => session.id === view.id) : undefined;
  const sessionView = view.kind === 'session';
  const title =
    view.kind === 'project'
      ? view.name
      : view.kind === 'session'
        ? (selectedSession && sessionLabel(selectedSession)) || view.id
        : view.kind;
  return (
    <div className="flex h-screen min-h-[480px] flex-col">
      <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <h1 data-testid="app-name" className="font-mono font-semibold tracking-tight">
          Mesa
        </h1>
        <span className="truncate text-sm capitalize text-muted-foreground">/ {title}</span>
        <details className="relative ml-auto">
          <summary className="cursor-pointer rounded-md px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            Profile and vault
          </summary>
          <div className="absolute right-0 z-50 mt-2 w-80 space-y-3 rounded-lg border bg-popover p-4 shadow-lg">
            <ProfileSummary doctor={doctor.data} />
            <LogBox />
          </div>
        </details>
      </header>
      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar
          view={view}
          onView={setView}
          projects={projects.data ?? []}
          sessions={sessions}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
        />
        <main className="min-w-0 flex-1 overflow-auto px-6 py-5">
          {/* The Board stays mounted so its terminal clients survive navigation. */}
          <div hidden={view.kind !== 'board' && !sessionView}>
            <BoardScreen
              selectedSession={view.kind === 'session' ? view.id : undefined}
              onRowsChange={setSessions}
              onBoard={() => setView({ kind: 'board' })}
            />
          </div>
          {view.kind === 'projects' && (
            <ProjectsScreen
              onRegistered={() => void projects.refresh()}
              onSelectProject={(name) => setView({ kind: 'project', name })}
            />
          )}
          {view.kind === 'project' &&
            (project ? (
              <ProjectWorkspace
                key={project.name}
                project={project}
                sessions={sessions}
                onSession={(id) => setView({ kind: 'session', id })}
                onChanged={() => void projects.refresh()}
                onUnregistered={() => {
                  void projects.refresh();
                  setView({ kind: 'projects' });
                }}
              />
            ) : projects.busy || !projects.data ? (
              <p className="text-sm text-muted-foreground">Loading project...</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Project unavailable. Open Projects to refresh the list.
              </p>
            ))}
          {view.kind === 'doctor' && <DoctorScreen doctor={doctor} />}
          {view.kind === 'help' && <HelpScreen />}
        </main>
      </div>
    </div>
  );
}
