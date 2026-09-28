import type { TreeRow } from '@mesa/core';
import { DEFAULT_SHORTCUTS, shortcutFromKeys } from '@mesa/core/browser';
import { Plus, Search, TerminalSquare, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionDialog } from './components/ActionDialog';
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

export function App({ startOnBoard = false }: { startOnBoard?: boolean } = {}) {
  const [view, setView] = useState<WorkspaceView>({ kind: 'board' });
  const [filesDirty, setFilesDirty] = useState(false);
  const [pendingView, setPendingView] = useState<WorkspaceView>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const openedInitialSession = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newSessionRequest, setNewSessionRequest] = useState<{
    count: number;
    project?: string;
    general?: boolean;
    location?: 'main' | 'worktree' | 'terminal';
  }>({ count: 0 });
  const [archiveSessionRequest, setArchiveSessionRequest] = useState<{
    count: number;
    id: string;
  }>();
  const [pendingNewSession, setPendingNewSession] = useState<{
    project?: string;
    general?: boolean;
    location?: 'main' | 'worktree' | 'terminal';
  }>();
  const [cloneLink, setCloneLink] = useState<{ url: string; request: number }>();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  const navigate = useCallback(
    (next: WorkspaceView) => {
      if (
        filesDirty &&
        view.kind === 'project' &&
        (next.kind !== 'project' || next.name !== view.name)
      )
        setPendingView(next);
      else setView(next);
    },
    [filesDirty, view],
  );
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  const openSearch = () => {
    searchReturnFocus.current = document.activeElement as HTMLElement;
    setSearchOpen(true);
  };
  const run = useRun();
  const openFileLink = useCallback(
    (session: string, target: string) => {
      void run('files.link', { session, target }).then((file) => {
        if (file) navigate({ kind: 'project', name: file.project, file });
      });
    },
    [navigate, run],
  );
  const { deepLinks } = usePlatform();
  const { act } = useAct();
  const doctor = useCommand('doctor.run');
  const config = useCommand('config.get');
  const projects = useCommand('projects.list');
  useEffect(() => {
    if (startOnBoard || openedInitialSession.current || !projects.data || sessions.length === 0)
      return;
    openedInitialSession.current = true;
    const first = sessions.find((session) => session.managed && !session.endedAt);
    if (first)
      setView((current) =>
        current.kind === 'board' ? { kind: 'session', id: first.id } : current,
      );
  }, [projects.data, sessions, startOnBoard]);
  const shortcuts = config.data?.shortcuts ?? DEFAULT_SHORTCUTS;
  const canStart = projects.data?.some((project) => project.exists) ?? false;
  const requestNewSession = useCallback(
    (
      preset: {
        project?: string;
        general?: boolean;
        location?: 'main' | 'worktree' | 'terminal';
      } = {},
    ) => {
      if (filesDirty && view.kind === 'project') {
        setPendingNewSession(preset);
        setPendingView({ kind: 'board' });
      } else {
        setView({ kind: 'board' });
        setNewSessionRequest((request) => ({ count: request.count + 1, ...preset }));
      }
    },
    [filesDirty, view],
  );
  useEffect(() => {
    let active = true;
    const open = (urls: string[]) => {
      for (const url of urls) {
        if (!url.startsWith('mesa:')) continue;
        if (!active) return;
        setCloneLink((last) => ({ url, request: (last?.request ?? 0) + 1 }));
        navigateRef.current({ kind: 'projects' });
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
        navigate({ kind: 'board' });
      } else if (key === shortcuts.newSession) {
        event.preventDefault();
        if (canStart) {
          requestNewSession();
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [
    searchOpen,
    shortcuts.search,
    shortcuts.board,
    shortcuts.newSession,
    canStart,
    navigate,
    requestNewSession,
  ]);
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
          <details className="relative">
            <summary
              aria-label="New session"
              className="flex size-8 cursor-pointer items-center justify-center rounded-md bg-secondary hover:bg-accent"
            >
              <Plus aria-hidden className="size-4" />
            </summary>
            <div className="absolute left-0 z-50 mt-2 w-60 rounded-md border bg-popover p-1 shadow-lg">
              <p className="px-2 py-1 text-xs text-muted-foreground">Recent projects</p>
              {projects.data
                ?.filter((entry) => entry.exists)
                .map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    className="flex w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={(event) => {
                      const menu = event.currentTarget.closest('details');
                      if (menu) menu.open = false;
                      requestNewSession({ project: entry.name });
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              {canStart && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={(event) => {
                    const menu = event.currentTarget.closest('details');
                    if (menu) menu.open = false;
                    requestNewSession({
                      project: project?.name ?? projects.data?.find((entry) => entry.exists)?.name,
                      location: 'terminal',
                    });
                  }}
                >
                  <TerminalSquare aria-hidden className="size-4" /> Open terminal
                </button>
              )}
              <div className="my-1 border-t" />
              <button
                type="button"
                className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={(event) => {
                  const menu = event.currentTarget.closest('details');
                  if (menu) menu.open = false;
                  requestNewSession({ general: true });
                }}
              >
                General Session{' '}
                <span className="text-xs text-muted-foreground">No project context</span>
              </button>
            </div>
          </details>
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
          onView={navigate}
          projects={projects.data ?? []}
          sessions={sessions}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onNewSession={(project, location) => requestNewSession({ project, location })}
          onArchiveSession={(id) => {
            navigate({ kind: 'session', id });
            setArchiveSessionRequest((request) => ({ count: (request?.count ?? 0) + 1, id }));
          }}
        />
        <main
          className={
            sessionView
              ? 'min-w-0 flex-1 overflow-hidden'
              : 'min-w-0 flex-1 overflow-auto px-6 py-5'
          }
        >
          {/* The Board stays mounted so its terminal clients survive navigation. */}
          <div
            hidden={view.kind !== 'board' && view.kind !== 'grid' && !sessionView}
            className={sessionView ? 'h-full' : undefined}
          >
            <BoardScreen
              gridMode={view.kind === 'grid'}
              gridGroups={config.data?.grid?.groups}
              onGridGroupsChanged={() => void config.refresh()}
              selectedSession={view.kind === 'session' ? view.id : undefined}
              projects={projects.data}
              onRowsChange={setSessions}
              onBoard={() => navigate({ kind: 'board' })}
              onProject={(name) => navigate({ kind: 'project', name })}
              newSessionRequest={newSessionRequest}
              archiveSessionRequest={archiveSessionRequest}
              preferences={config.data?.board}
              onPreferencesChanged={() => void config.refresh()}
              onSelectSession={(id) => navigate({ kind: 'session', id })}
              onFileLink={openFileLink}
            />
          </div>
          {view.kind === 'projects' && (
            <ProjectsScreen
              cloneLink={cloneLink}
              onRegistered={() => void projects.refresh()}
              onSelectProject={(name) => navigate({ kind: 'project', name })}
            />
          )}
          {view.kind === 'project' &&
            (project ? (
              <ProjectWorkspace
                key={project.name}
                project={project}
                filesDirty={filesDirty}
                file={view.file}
                onFilesDirtyChange={setFilesDirty}
                sessions={sessions}
                onSession={(id) => navigate({ kind: 'session', id })}
                onNewSession={(project, location) => requestNewSession({ project, location })}
                onChanged={() => void projects.refresh()}
                onUnregistered={() => {
                  void projects.refresh();
                  navigate({ kind: 'projects' });
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
          if (hit.kind === 'project') navigate({ kind: 'project', name: hit.id });
          else if (hit.kind === 'session') navigate({ kind: 'session', id: hit.id });
          else if (hit.id === 'new-session') {
            requestNewSession();
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
              navigate({ kind: destination });
            }
          }
        }}
      />
      {pendingView && (
        <ActionDialog
          testId="file-navigation-dialog"
          title="Discard unsaved file changes?"
          description="Save or discard the open file before leaving this project."
          submit={{
            label: 'Discard changes',
            testId: 'confirm-file-navigation',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => {
            setFilesDirty(false);
            setView(pendingView);
            if (pendingNewSession)
              setNewSessionRequest((request) => ({
                count: request.count + 1,
                ...pendingNewSession,
              }));
            setPendingNewSession(undefined);
            setPendingView(undefined);
          }}
          onCancel={() => {
            setPendingView(undefined);
            setPendingNewSession(undefined);
          }}
        >
          <p className="text-sm">Unsaved edits will be lost.</p>
        </ActionDialog>
      )}
    </div>
  );
}
