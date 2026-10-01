import type { TreeRow } from '@mesa/core';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_SHORTCUTS,
  GENERAL_PROJECT,
  shortcutFromKeys,
} from '@mesa/core/browser';
import {
  Bell,
  ChartNoAxesCombined,
  CircleHelp,
  DollarSign,
  Plus,
  Search,
  TerminalSquare,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionDialog } from './components/ActionDialog';
import type { ProjectAddRequest } from './components/AddProjectMenu';
import { CommandPalette } from './components/CommandPalette';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { useToast, warned } from './components/Toast';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { WorkspaceSidebar, type WorkspaceView } from './components/WorkspaceSidebar';
import { usePlatform } from './lib/MesaRoot';
import type { NativeNotice } from './lib/platform';
import { useAct } from './lib/useAct';
import { useCommand, useRun } from './lib/useCommand';
import { useMesaLinks } from './lib/useMesaLinks';
import { BackupScreen } from './screens/BackupScreen';
import { BoardScreen } from './screens/board/BoardScreen';
import { activeSession, recoverable } from './screens/board/rows';
import { DoctorScreen } from './screens/DoctorScreen';
import { DailyScreen } from './screens/daily/DailyScreen';
import { HelpScreen } from './screens/HelpScreen';
import { InboxScreen } from './screens/InboxScreen';
import { MapScreen } from './screens/MapScreen';
import { PreferencesScreen } from './screens/PreferencesScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspace } from './screens/ProjectWorkspace';
import { AddProjectDialog } from './screens/projects/AddProjectDialog';
import { ImportWorkspaceDialog } from './screens/projects/ImportWorkspaceDialog';
import { SavedPromptsScreen } from './screens/SavedPromptsScreen';
import { ShortcutSettings } from './screens/ShortcutSettings';
import { TourScreen } from './screens/TourScreen';
import { UsageScreen } from './screens/UsageScreen';
import { VaultScreen } from './screens/vault/VaultScreen';

export function App({ startOnBoard = false }: { startOnBoard?: boolean } = {}) {
  const [view, setView] = useState<WorkspaceView>({ kind: startOnBoard ? 'board' : 'sessions' });
  const [filesDirty, setFilesDirty] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const closing = useRef(false);
  const approvedClose = useRef(false);
  const cancelClose = useRef(false);
  const [pendingView, setPendingView] = useState<WorkspaceView>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const openedInitialSession = useRef(false);
  const openedInitialTour = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newSessionRequest, setNewSessionRequest] = useState<{
    count: number;
    project?: string;
    general?: boolean;
    location?: 'main' | 'worktree' | 'terminal';
    parent?: string;
  }>({ count: 0 });
  const [archiveSessionRequest, setArchiveSessionRequest] = useState<{
    count: number;
    id: string;
  }>();
  const [dependencySessionRequest, setDependencySessionRequest] = useState<{
    count: number;
    id: string;
  }>();
  const [promptInsertRequest, setPromptInsertRequest] = useState<{
    session: string;
    text: string;
  }>();
  const [pendingNewSession, setPendingNewSession] = useState<{
    project?: string;
    general?: boolean;
    location?: 'main' | 'worktree' | 'terminal';
    parent?: string;
  }>();
  const [cloneLink, setCloneLink] = useState<{ url: string; request: number }>();
  const [projectAdd, setProjectAdd] = useState<ProjectAddRequest>();
  const [projectsRevision, setProjectsRevision] = useState(0);
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
  const toast = useToast();
  const openFileLink = useCallback(
    (session: string, target: string) => {
      void run('files.link', { session, target }).then((file) => {
        if (file) navigate({ kind: 'project', name: file.project, file });
      });
    },
    [navigate, run],
  );
  const { notifications, lifecycle } = usePlatform();
  const { act } = useAct();
  const doctor = useCommand('doctor.run');
  const config = useCommand('config.get');
  const prompts = useCommand('prompts.list');
  const projects = useCommand('projects.list');
  const needsProfileSetup = config.error?.code === 'not_found';
  const profileInitialised = async () => {
    openedInitialTour.current = true;
    await Promise.all([config.refresh(), doctor.refresh(), prompts.refresh()]);
  };
  const projectRegistered = async () => {
    await projects.refresh();
    setProjectsRevision((value) => value + 1);
  };
  useEffect(() => {
    if (!config.data || openedInitialTour.current) return;
    openedInitialTour.current = true;
    if (config.data.onboarding?.status === 'active')
      setView((current) =>
        current.kind === 'board' || current.kind === 'sessions' ? { kind: 'tour' } : current,
      );
  }, [config.data]);
  const finishQuit = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      if (config.data?.application?.backupOnClose && !(await run('backup.create'))) return;
      if (cancelClose.current) return;
      approvedClose.current = true;
      await lifecycle.close();
      setQuitOpen(false);
    } catch (error) {
      toast(
        `Could not close Mesa: ${error instanceof Error ? error.message : String(error)}`,
        'alert',
      );
    } finally {
      approvedClose.current = false;
      closing.current = false;
    }
  }, [config.data?.application?.backupOnClose, lifecycle, run, toast]);
  useEffect(() => {
    if (!config.data) return;
    let active = true;
    let stop: (() => void) | undefined;
    void lifecycle
      .onCloseRequested((event) => {
        if (approvedClose.current) return;
        event.preventDefault();
        cancelClose.current = false;
        if (config.data?.application?.warnBeforeQuit ?? true) setQuitOpen(true);
        else void finishQuit();
      })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [config.data?.application?.warnBeforeQuit, config.data, lifecycle, finishQuit]);
  const appearance = config.data?.appearance ?? DEFAULT_APPEARANCE;
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      root.dataset.theme =
        appearance.theme === 'system' ? (media?.matches ? 'dark' : 'light') : appearance.theme;
    };
    applyTheme();
    media?.addEventListener('change', applyTheme);
    root.dataset.font = appearance.font;
    root.dataset.density = appearance.density;
    root.dataset.colorVision = appearance.colorVision;
    root.style.fontSize = `${appearance.fontSize}px`;
    return () => {
      media?.removeEventListener('change', applyTheme);
      delete root.dataset.theme;
      delete root.dataset.font;
      delete root.dataset.density;
      delete root.dataset.colorVision;
      root.style.removeProperty('font-size');
    };
  }, [
    appearance.theme,
    appearance.font,
    appearance.fontSize,
    appearance.density,
    appearance.colorVision,
  ]);
  useEffect(() => {
    if (
      startOnBoard ||
      config.data?.onboarding?.status === 'active' ||
      openedInitialSession.current ||
      !projects.data ||
      sessions.length === 0
    )
      return;
    const first = sessions.find((session) => activeSession(session) || recoverable(session));
    if (!first) return;
    openedInitialSession.current = true;
    setView((current) =>
      current.kind === 'board' || current.kind === 'sessions'
        ? { kind: 'session', id: first.id }
        : current,
    );
  }, [projects.data, sessions, startOnBoard, config.data?.onboarding?.status]);
  const shortcuts = config.data?.shortcuts ?? DEFAULT_SHORTCUTS;
  const canStart = projects.data?.some((project) => project.exists) ?? false;
  const requestNewSession = useCallback(
    (
      preset: {
        project?: string;
        general?: boolean;
        location?: 'main' | 'worktree' | 'terminal';
        parent?: string;
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
    const announced = new Set<string>();
    const check = async () => {
      const report = await run('usage.list', {});
      if (!active || !report) return;
      const day = new Date().toISOString().slice(0, 10);
      for (const alert of report.alerts) {
        const key = `${alert.period}:${alert.period === 'month' ? day.slice(0, 7) : day}:${alert.thresholdUsd}`;
        if (announced.has(key)) continue;
        announced.add(key);
        toast(
          `Known estimated ${alert.period === 'month' ? 'calendar month' : alert.period} cost reached your $${alert.thresholdUsd.toFixed(2)} alert. Agents keep running.`,
          'alert',
          { label: 'Open Usage', onFollow: () => navigateRef.current({ kind: 'usage' }) },
        );
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 300_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run, toast]);
  const linkGuidance = useMesaLinks({
    session: (id) => navigateRef.current({ kind: 'session', id }),
    clone: (url) => {
      setCloneLink((last) => ({ url, request: (last?.request ?? 0) + 1 }));
      navigateRef.current({ kind: 'projects' });
    },
    profileChanged: () =>
      setView((current) => (current.kind === 'session' ? { kind: 'board' } : current)),
  });

  useEffect(() => {
    let active = true;
    let busy = false;
    const deliver = async () => {
      if (busy) return;
      busy = true;
      try {
        const status = await notifications.status();
        if (!active || !['authorized', 'provisional', 'ephemeral'].includes(status.authorization))
          return;
        const plan = await run('notifications.delivery');
        if (!active || !plan || plan.kind === 'none') return;
        await notifications.send(plan);
        if (active) await run('notifications.delivered', { ids: plan.ids });
      } catch {
        // A failed native send stays pending for the next poll.
      } finally {
        busy = false;
      }
    };
    void deliver();
    const timer = window.setInterval(() => void deliver(), 5_000);
    let stop: (() => void) | undefined;
    const open = (target: NativeNotice['target']) => {
      if (active)
        navigateRef.current(
          target.kind === 'session' ? { kind: 'session', id: target.id } : { kind: target.kind },
        );
    };
    void notifications.onOpen(open).then(async (unlisten) => {
      if (active) {
        stop = unlisten;
        const target = await notifications.takeOpened();
        if (target) open(target);
      } else unlisten();
    });
    return () => {
      active = false;
      window.clearInterval(timer);
      stop?.();
    };
  }, [notifications, run]);
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
      <header
        data-tauri-drag-region
        className="relative z-40 flex h-12 shrink-0 items-center gap-3 border-b bg-background pr-4 pl-20"
      >
        <h1
          data-testid="app-name"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground"
          >
            M
          </span>
          Mesa
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            data-testid="search-trigger"
            className="min-w-0 w-44 shrink justify-between rounded-full bg-card/80 text-muted-foreground sm:w-72"
            onClick={openSearch}
          >
            <span className="flex items-center gap-2">
              <Search aria-hidden className="size-4" /> Search Mesa
            </span>
            <kbd className="text-xs">{shortcuts.search.replace('Mod', '⌘')}</kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon-sm" aria-label="New session">
                <Plus aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
              {projects.data
                ?.filter((entry) => entry.exists)
                .map((entry) => (
                  <DropdownMenuItem
                    key={entry.name}
                    onSelect={() => requestNewSession({ project: entry.name })}
                  >
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              {canStart && (
                <DropdownMenuItem
                  onSelect={() =>
                    requestNewSession({
                      project: project?.name ?? projects.data?.find((entry) => entry.exists)?.name,
                      location: 'terminal',
                    })
                  }
                >
                  <TerminalSquare aria-hidden className="size-4" /> Open terminal
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex-col items-start gap-0"
                onSelect={() => requestNewSession({ general: true })}
              >
                General Session{' '}
                <span className="text-xs text-muted-foreground">No project context</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav aria-label="Workspace shortcuts" className="ml-auto flex shrink-0 items-center gap-2">
          {(
            [
              ['Cost', DollarSign, 'usage', 'cost'],
              ['Help', CircleHelp, 'help', 'help'],
              ['Analytics', ChartNoAxesCombined, 'usage', 'usage'],
              ['Notifications', Bell, 'inbox', 'inbox'],
            ] as const
          ).map(([label, Icon, kind, id]) => (
            <Button
              key={id}
              variant="ghost"
              size="icon-sm"
              data-testid={`nav-${id}`}
              aria-label={label}
              aria-current={view.kind === kind ? 'page' : undefined}
              title={label}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ kind })}
            >
              <Icon aria-hidden className="size-4" />
            </Button>
          ))}
        </nav>
        <details ref={profileMenu} className="relative shrink-0">
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
      {linkGuidance && (
        <p role="status" data-testid="mesa-link-guidance" className="px-6 py-2 text-sm">
          {linkGuidance}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar
          view={view}
          onView={navigate}
          projects={projects.data ?? []}
          sessions={sessions}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onAddProject={setProjectAdd}
          onNewSession={(project, location, parent) =>
            requestNewSession({
              ...(project === GENERAL_PROJECT ? { general: true } : { project }),
              location,
              parent,
            })
          }
          onArchiveSession={(id) => {
            navigate({ kind: 'session', id });
            setArchiveSessionRequest((request) => ({ count: (request?.count ?? 0) + 1, id }));
          }}
          onDependencySession={(id) => {
            navigate({ kind: 'session', id });
            setDependencySessionRequest((request) => ({ count: (request?.count ?? 0) + 1, id }));
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
            hidden={
              view.kind !== 'board' &&
              view.kind !== 'sessions' &&
              view.kind !== 'grid' &&
              !sessionView
            }
            className={sessionView || view.kind === 'sessions' ? 'h-full' : undefined}
          >
            <BoardScreen
              startWhenEmpty={view.kind === 'sessions'}
              onAddProject={setProjectAdd}
              gridMode={view.kind === 'grid'}
              gridGroups={config.data?.grid?.groups}
              onGridGroupsChanged={() => void config.refresh()}
              selectedSession={view.kind === 'session' ? view.id : undefined}
              projects={projects.data ?? (needsProfileSetup ? [] : undefined)}
              projectsError={needsProfileSetup ? undefined : projects.error?.message}
              onRetryProjects={() => void projects.refresh()}
              onRowsChange={setSessions}
              onBoard={() => navigate({ kind: 'board' })}
              onProject={(name) => navigate({ kind: 'project', name })}
              newSessionRequest={newSessionRequest}
              archiveSessionRequest={archiveSessionRequest}
              dependencySessionRequest={dependencySessionRequest}
              preferences={config.data?.board}
              terminalPreferences={config.data?.terminal}
              savedPrompts={prompts.data}
              promptInsertRequest={promptInsertRequest}
              onPreferencesChanged={() => void config.refresh()}
              onSelectSession={(id) => navigate({ kind: 'session', id })}
              onFileLink={openFileLink}
            />
          </div>
          {view.kind === 'projects' && (
            <ProjectsScreen
              refreshRequest={projectsRevision}
              onAddProject={setProjectAdd}
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
                onVaultItem={(path) => navigate({ kind: 'vault', path })}
                onNewSession={(project, location) => requestNewSession({ project, location })}
                onAgentSettings={() => navigate({ kind: 'doctor' })}
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
          {view.kind === 'usage' && (
            <UsageScreen onSession={(id) => navigate({ kind: 'session', id })} />
          )}
          {view.kind === 'map' && (
            <MapScreen
              onSession={(id) => navigate({ kind: 'session', id })}
              onVaultItem={(path) => navigate({ kind: 'vault', path })}
            />
          )}
          {view.kind === 'daily' && (
            <DailyScreen onVaultItem={(path) => navigate({ kind: 'vault', path })} />
          )}
          {view.kind === 'vault' && (
            <VaultScreen key={view.query} query={view.query} path={view.path} />
          )}
          {view.kind === 'inbox' && (
            <InboxScreen
              onSession={(id) => navigate({ kind: 'session', id })}
              onDoctor={() => navigate({ kind: 'doctor' })}
            />
          )}
          {view.kind === 'help' && <HelpScreen />}
          {view.kind === 'preferences' && (
            <PreferencesScreen
              config={config.data}
              onChanged={() => void config.refresh()}
              onNavigate={(kind) => navigate({ kind })}
              onReplayTour={() =>
                void act(async () => {
                  if (
                    !(await run('config.set', {
                      path: 'onboarding',
                      value: { status: 'active', step: 0 },
                    }))
                  )
                    return undefined;
                  await config.refresh();
                  navigate({ kind: 'tour' });
                  return undefined;
                })
              }
            />
          )}
          {view.kind === 'prompts' && (
            <SavedPromptsScreen prompts={prompts.data} onChanged={() => void prompts.refresh()} />
          )}
          {view.kind === 'backup' && <BackupScreen />}
          {view.kind === 'tour' && config.data && (
            <TourScreen
              state={config.data.onboarding}
              onChanged={() => void config.refresh()}
              onFinish={() => navigate({ kind: 'board' })}
              onNavigate={(kind) => navigate({ kind })}
              onSearch={openSearch}
            />
          )}
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
        prompts={view.kind === 'session' ? prompts.data : undefined}
        returnFocus={searchReturnFocus.current}
        onSelect={(hit) => {
          if (hit.kind === 'project') navigate({ kind: 'project', name: hit.id });
          else if (hit.kind === 'session') navigate({ kind: 'session', id: hit.id });
          else if (hit.kind === 'vault') navigate({ kind: 'vault', query: hit.id });
          else if (hit.kind === 'prompt' && view.kind === 'session') {
            const saved = prompts.data?.find((prompt) => prompt.name === hit.id);
            if (saved) setPromptInsertRequest({ session: view.id, text: saved.text });
          } else if (hit.id === 'new-session') {
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
              destination === 'usage' ||
              destination === 'inbox' ||
              destination === 'help' ||
              destination === 'preferences' ||
              destination === 'prompts' ||
              destination === 'backup' ||
              destination === 'shortcuts'
            ) {
              navigate({ kind: destination });
            }
          }
        }}
      />
      {projectAdd?.kind === 'local' && (
        <AddProjectDialog
          needsProfileSetup={needsProfileSetup}
          onInitialised={profileInitialised}
          onCancel={() => setProjectAdd(undefined)}
          onRegistered={projectRegistered}
          returnFocus={projectAdd.returnFocus}
        />
      )}
      {projectAdd?.kind === 'import' && (
        <ImportWorkspaceDialog
          onCancel={() => setProjectAdd(undefined)}
          onRegistered={projectRegistered}
          returnFocus={projectAdd.returnFocus}
        />
      )}
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
      {quitOpen && (
        <ActionDialog
          testId="quit-dialog"
          title="Quit Mesa?"
          description="Agent sessions keep running after the app closes."
          submit={{ label: 'Quit Mesa', testId: 'confirm-quit', disabled: closing.current }}
          onSubmit={() => {
            cancelClose.current = false;
            void finishQuit();
          }}
          onCancel={() => {
            cancelClose.current = true;
            setQuitOpen(false);
          }}
        >
          <p className="text-sm">You can return to your sessions when you reopen Mesa.</p>
        </ActionDialog>
      )}
    </div>
  );
}
