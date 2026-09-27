import type { TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { warned } from './components/Toast';
import { Button } from './components/ui/button';
import { WorkspaceSidebar, type WorkspaceView } from './components/WorkspaceSidebar';
import { useAct } from './lib/useAct';
import { useCommand, useRun } from './lib/useCommand';
import { BoardScreen } from './screens/board/BoardScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspace } from './screens/ProjectWorkspace';

export function App() {
  const [view, setView] = useState<WorkspaceView>({ kind: 'board' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newSessionRequest, setNewSessionRequest] = useState(0);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  const openSearch = () => {
    searchReturnFocus.current = document.activeElement as HTMLElement;
    setSearchOpen(true);
  };
  const run = useRun();
  const { act } = useAct();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else {
          searchReturnFocus.current = document.activeElement as HTMLElement;
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [searchOpen]);
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
        <Button
          variant="outline"
          size="sm"
          data-testid="search-trigger"
          className="ml-auto w-44 justify-between text-muted-foreground sm:w-64"
          onClick={openSearch}
        >
          <span className="flex items-center gap-2">
            <Search aria-hidden className="size-4" /> Search Mesa
          </span>
          <kbd className="text-xs">⌘K</kbd>
        </Button>
        <details ref={profileMenu} className="relative">
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
              newSessionRequest={newSessionRequest}
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
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={projects.data ?? []}
        sessions={sessions}
        returnFocus={searchReturnFocus.current}
        onSelect={(hit) => {
          if (hit.kind === 'project') setView({ kind: 'project', name: hit.id });
          else if (hit.kind === 'session') setView({ kind: 'session', id: hit.id });
          else if (hit.id === 'new-session') {
            setView({ kind: 'board' });
            setNewSessionRequest((count) => count + 1);
          } else if (hit.id === 'open-vault') {
            void act(async () => warned((await run('vault.open'))?.warning));
          } else if (hit.id === 'profile') {
            if (profileMenu.current) profileMenu.current.open = true;
            profileMenu.current?.querySelector('summary')?.focus();
          } else {
            const destination = hit.id === 'skills' ? 'projects' : hit.id;
            if (
              destination === 'board' ||
              destination === 'projects' ||
              destination === 'doctor' ||
              destination === 'help'
            ) {
              setView({ kind: destination });
            }
          }
        }}
      />
    </div>
  );
}
