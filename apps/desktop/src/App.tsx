import type { TreeRow } from '@mesa/core';
import { DEFAULT_SHORTCUTS, shortcutFromKeys } from '@mesa/core/browser';
import { Plus, Search, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { warned } from './components/Toast';
import { Button } from './components/ui/button';
import { WorkspaceSidebar, type WorkspaceView } from './components/WorkspaceSidebar';
import { usePlatform } from './lib/MesaRoot';
import { useAct } from './lib/useAct';
import { useCommand, useRun } from './lib/useCommand';
import { BoardScreen } from './screens/board/BoardScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspace } from './screens/ProjectWorkspace';
import { ShortcutSettings } from './screens/ShortcutSettings';

export function App() {
  const [view, setView] = useState<WorkspaceView>({ kind: 'board' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newSessionRequest, setNewSessionRequest] = useState(0);
  const [cloneLink, setCloneLink] = useState<{ url: string; request: number }>();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  const openSearch = () => {
    searchReturnFocus.current = document.activeElement as HTMLElement;
    setSearchOpen(true);
  };
  const run = useRun();
  const { deepLinks } = usePlatform();
  const { act } = useAct();
  const doctor = useCommand('doctor.run');
  const config = useCommand('config.get');
  const projects = useCommand('projects.list');
  const shortcuts = config.data?.shortcuts ?? DEFAULT_SHORTCUTS;
  const canStart = projects.data?.some((project) => project.exists) ?? false;
  useEffect(() => {
    let active = true;
    const open = (urls: string[]) => {
      for (const url of urls) {
        if (!url.startsWith('mesa:')) continue;
        if (!active) return;
        setCloneLink((last) => ({ url, request: (last?.request ?? 0) + 1 }));
        setView({ kind: 'projects' });
      }
    };
    let stop: (() => void) | undefined;
    void deepLinks.onOpen(open).then((unlisten) => {
      if (active) {
        stop = unlisten;
        void deepLinks.current().then((urls) => urls && open(urls));
      } else unlisten();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [deepLinks]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const key = shortcutFromKeys(event);
      if (key === shortcuts.search) {
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else {
          searchReturnFocus.current = document.activeElement as HTMLElement;
          setSearchOpen(true);
        }
      } else if (key === shortcuts.board) {
        event.preventDefault();
        setView({ kind: 'board' });
      } else if (key === shortcuts.newSession) {
        event.preventDefault();
        if (canStart) {
          setView({ kind: 'board' });
          setNewSessionRequest((count) => count + 1);
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [searchOpen, shortcuts.search, shortcuts.board, shortcuts.newSession, canStart]);
  const project =
    view.kind === 'project' ? projects.data?.find((p) => p.name === view.name) : undefined;
  const sessionView = view.kind === 'session';
  return (
    <div className="flex h-screen min-h-[480px] flex-col">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <h1 data-testid="app-name" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground"
          >
            M
          </span>
          Mesa
        </h1>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            data-testid="search-trigger"
            className="w-44 justify-between rounded-full bg-card/80 text-muted-foreground sm:w-72"
            onClick={openSearch}
          >
            <span className="flex items-center gap-2">
              <Search aria-hidden className="size-4" /> Search Mesa
            </span>
            <kbd className="text-xs">{shortcuts.search.replace('Mod', '⌘')}</kbd>
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="New session"
            disabled={!canStart}
            onClick={() => {
              setView({ kind: 'board' });
              setNewSessionRequest((count) => count + 1);
            }}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <details ref={profileMenu} className="relative ml-auto">
          <summary
            aria-label="Profile and vault"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border bg-card text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <UserRound aria-hidden className="size-4" />
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
        <main
          className={
            sessionView
              ? 'min-w-0 flex-1 overflow-hidden'
              : 'min-w-0 flex-1 overflow-auto px-6 py-5'
          }
        >
          {/* The Board stays mounted so its terminal clients survive navigation. */}
          <div hidden={view.kind !== 'board' && view.kind !== 'grid' && !sessionView}>
            <BoardScreen
              gridMode={view.kind === 'grid'}
              gridGroups={config.data?.grid?.groups}
              onGridGroupsChanged={() => void config.refresh()}
              selectedSession={view.kind === 'session' ? view.id : undefined}
              onRowsChange={setSessions}
              onBoard={() => setView({ kind: 'board' })}
              newSessionRequest={newSessionRequest}
              preferences={config.data?.board}
              onPreferencesChanged={() => void config.refresh()}
              onSelectSession={(id) => setView({ kind: 'session', id })}
            />
          </div>
          {view.kind === 'projects' && (
            <ProjectsScreen
              cloneLink={cloneLink}
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
          {view.kind === 'shortcuts' && (
            <ShortcutSettings
              shortcuts={config.data?.shortcuts}
              onChanged={() => void config.refresh()}
            />
          )}
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
              destination === 'grid' ||
              destination === 'projects' ||
              destination === 'doctor' ||
              destination === 'help' ||
              destination === 'shortcuts'
            ) {
              setView({ kind: destination });
            }
          }
        }}
      />
    </div>
  );
}
