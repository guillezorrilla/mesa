import type { ProjectSort, TreeRow } from '@mesa/core';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_SHORTCUTS,
  GENERAL_PROJECT,
  shortcutFromKeys,
} from '@mesa/core/browser';
import { DollarSign, Plus, Search, Settings2, TerminalSquare, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import mesaLogo from '../src-tauri/icons/128x128.png';
import { ActionDialog } from './components/ActionDialog';
import type { ProjectAddRequest } from './components/AddProjectMenu';
import { CloneProjectDialog } from './components/CloneProjectDialog';
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
import { FIXED_SHORTCUTS, keyCaps, pressed } from './lib/fixedShortcuts';
import { usePlatform } from './lib/MesaRoot';
import type { NativeNotice } from './lib/platform';
import { useAct } from './lib/useAct';
import { useCommand, useRun } from './lib/useCommand';
import { useMesaLinks } from './lib/useMesaLinks';
import { BackupScreen } from './screens/BackupScreen';
import { activeSession, recoverable, waitingForInput } from './screens/board/rows';
import { SessionsScreen } from './screens/board/SessionsScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { DailyScreen } from './screens/daily/DailyScreen';
import { HelpScreen } from './screens/HelpScreen';
import { HelpMenu } from './screens/help/HelpMenu';
import { KeyboardShortcutsDialog } from './screens/help/KeyboardShortcutsDialog';
import { MapScreen } from './screens/MapScreen';
import { NotificationsMenu } from './screens/notifications/NotificationsMenu';
import { ProjectWorkspace } from './screens/ProjectWorkspace';
import { AddProjectDialog } from './screens/projects/AddProjectDialog';
import { ImportWorkspaceDialog } from './screens/projects/ImportWorkspaceDialog';
import { SavedPromptsScreen } from './screens/SavedPromptsScreen';
import type { SettingsCategory } from './screens/settings/categories';
import { SettingsDialog } from './screens/settings/SettingsDialog';
import { TourScreen } from './screens/TourScreen';
import { UsageDialog } from './screens/usage/UsageDialog';
import { VaultScreen } from './screens/vault/VaultScreen';

export function App() {
  const [view, setView] = useState<WorkspaceView>({ kind: 'sessions' });
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
  // Sessions starting, by project (GENERAL_PROJECT for General): the sidebar shows each until it opens.
  const [starting, setStarting] = useState<string[]>([]);
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
  const [cloneLink, setCloneLink] = useState<{ url: string; request: number }>();
  const [projectAdd, setProjectAdd] = useState<ProjectAddRequest>();
  const [projectSort, setProjectSort] = useState<ProjectSort>('recent');
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  // Usage and Notifications open over the current view, as the reference app's dialog and menu do.
  const [overlay, setOverlay] = useState<'usage' | 'inbox' | 'settings' | 'shortcuts'>();
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>();
  const navigate = useCallback(
    (next: WorkspaceView) => {
      if (next.kind === 'usage' || next.kind === 'inbox' || next.kind === 'shortcuts') {
        setOverlay(next.kind);
        return;
      }
      if (next.kind === 'preferences') {
        setSettingsCategory(undefined);
        setOverlay('settings');
        return;
      }
      setOverlay(undefined);
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
  const { notifications, lifecycle, dock } = usePlatform();
  const { act } = useAct();
  const doctor = useCommand('doctor.run');
  const config = useCommand('config.get');
  const prompts = useCommand('prompts.list');
  const projects = useCommand('projects.list');
  const sortedProjects = useCommand('projects.sorted', projectSort);
  useEffect(() => {
    if (projects.data) void sortedProjects.refresh();
  }, [projects.data, sortedProjects.refresh]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: session refreshes keep activity-based project sorting current.
  useEffect(() => {
    if (projectSort === 'active-sessions' || projectSort === 'last-session')
      void sortedProjects.refresh();
  }, [sessions, projectSort, sortedProjects.refresh]);
  const needsProfileSetup = config.error?.code === 'not_found';
  const profileInitialised = async () => {
    openedInitialTour.current = true;
    await Promise.all([config.refresh(), doctor.refresh(), prompts.refresh()]);
  };
  const projectRegistered = async () => {
    await projects.refresh();
  };
  useEffect(() => {
    if (!config.data || openedInitialTour.current) return;
    openedInitialTour.current = true;
    if (config.data.onboarding?.status === 'active')
      setView((current) => (current.kind === 'sessions' ? { kind: 'tour' } : current));
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
  const visualAlert = config.data?.notifications?.visualAlert ?? true;
  const waiting = visualAlert ? sessions.filter(waitingForInput).length : 0;
  useEffect(() => {
    if (!config.data) return;
    // A badge that fails to set leaves the app as it was; the next change tries again.
    void dock.badge(waiting).catch(() => {});
  }, [config.data, dock, waiting]);
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
      current.kind === 'sessions' ? { kind: 'session', id: first.id } : current,
    );
  }, [projects.data, sessions, config.data?.onboarding?.status]);
  const shortcuts = config.data?.shortcuts ?? DEFAULT_SHORTCUTS;
  const canStart = projects.data?.some((project) => project.exists) ?? false;
  /**
   * Starts a session at once, as the reference app does: no dialog, and no agent, so `mesa open` takes the
   * project's, else the profile default. With no project named, the one in view, else the first
   * that exists. Once it opens, it is shown.
   */
  const requestNewSession = useCallback(
    async (
      preset: {
        project?: string;
        general?: boolean;
        location?: 'main' | 'worktree' | 'terminal';
        parent?: string;
      } = {},
    ) => {
      const inView =
        view.kind === 'project'
          ? view.name
          : view.kind === 'session'
            ? sessions.find((session) => session.id === view.id)?.project
            : undefined;
      const project = preset.general
        ? undefined
        : (preset.project ??
          (inView && inView !== GENERAL_PROJECT ? inView : undefined) ??
          projects.data?.find((entry) => entry.exists)?.name);
      if (!preset.general && !project) {
        navigate({ kind: 'sessions' });
        return;
      }
      const key = project ?? GENERAL_PROJECT;
      setStarting((current) => [...current, key]);
      try {
        const opened = await run('sessions.open', {
          ...(project ? { project } : { general: true }),
          parent: preset.parent,
          terminal: preset.location === 'terminal' || undefined,
          worktree: preset.location === 'worktree' || undefined,
        });
        if (!opened) return;
        // No confirmation, as the session shows; a warning (hooks to trust) still says so.
        const warning = warned(opened.warning);
        if (warning) toast(warning.text, warning.tone);
        // The latest navigate: files may have been edited while it opened.
        navigateRef.current({ kind: 'session', id: opened.id });
      } finally {
        setStarting((current) => current.filter((_, i) => i !== current.indexOf(key)));
      }
    },
    [view, sessions, projects.data, run, navigate, toast],
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
    },
    profileChanged: () =>
      setView((current) => (current.kind === 'session' ? { kind: 'sessions' } : current)),
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
      } else if (pressed(event, FIXED_SHORTCUTS.keyboardShortcuts)) {
        event.preventDefault();
        setSearchOpen(false);
        setOverlay('shortcuts');
      } else if (key === shortcuts.board) {
        event.preventDefault();
        navigate({ kind: 'sessions' });
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
  const refreshSorted = useRef(sortedProjects.refresh);
  refreshSorted.current = sortedProjects.refresh;
  const visitedProject = view.kind === 'project' ? view.name : undefined;
  useEffect(() => {
    if (visitedProject)
      void run('projects.visit', { name: visitedProject }).then(() => refreshSorted.current());
  }, [visitedProject, run]);
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
          <img src={mesaLogo} alt="" aria-hidden className="size-10 object-contain" />
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
            <kbd className="text-xs">{keyCaps(shortcuts.search).join('')}</kbd>
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
          {([['Cost', DollarSign, 'usage', 'cost']] as const).map(([label, Icon, kind, id]) => (
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
          <HelpMenu
            onShortcuts={() => setOverlay('shortcuts')}
            onReference={() => navigate({ kind: 'help' })}
          />
          <NotificationsMenu
            open={overlay === 'inbox'}
            onOpenChange={(open) => setOverlay(open ? 'inbox' : undefined)}
            onSession={(id) => navigate({ kind: 'session', id })}
            onDoctor={() => navigate({ kind: 'doctor' })}
            onSettings={() => {
              setSettingsCategory('notifications');
              setOverlay('settings');
            }}
            onRecheck={doctor.refresh}
            doctor={doctor.data}
          />
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
            <button
              type="button"
              data-testid="open-settings"
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
              onClick={() => {
                if (profileMenu.current) profileMenu.current.open = false;
                navigate({ kind: 'preferences' });
              }}
            >
              <Settings2 aria-hidden className="size-4" /> Settings
            </button>
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
          projects={sortedProjects.data ?? projects.data ?? []}
          sort={projectSort}
          onSort={setProjectSort}
          sessions={sessions}
          waiting={waiting}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onAddProject={setProjectAdd}
          starting={starting}
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
          {/* Sessions stays mounted so its terminal clients survive navigation. */}
          <div
            hidden={view.kind !== 'sessions' && view.kind !== 'grid' && !sessionView}
            className={sessionView || view.kind === 'sessions' ? 'h-full' : undefined}
          >
            <SessionsScreen
              onAddProject={setProjectAdd}
              gridMode={view.kind === 'grid'}
              gridGroups={config.data?.grid?.groups}
              onGridGroupsChanged={() => void config.refresh()}
              selectedSession={view.kind === 'session' ? view.id : undefined}
              projects={projects.data ?? (needsProfileSetup ? [] : undefined)}
              projectsError={needsProfileSetup ? undefined : projects.error?.message}
              onRetryProjects={() => void projects.refresh()}
              onRowsChange={setSessions}
              onSessions={() => navigate({ kind: 'sessions' })}
              onProject={(name) => navigate({ kind: 'project', name })}
              archiveSessionRequest={archiveSessionRequest}
              dependencySessionRequest={dependencySessionRequest}
              terminalPreferences={config.data?.terminal}
              savedPrompts={prompts.data}
              promptInsertRequest={promptInsertRequest}
              onSelectSession={(id) => navigate({ kind: 'session', id })}
              onFileLink={openFileLink}
            />
          </div>
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
                  navigate({ kind: 'sessions' });
                }}
              />
            ) : projects.busy || !projects.data ? (
              <p className="text-sm text-muted-foreground">Loading project...</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Project unavailable. Choose another project from the sidebar.
              </p>
            ))}
          {view.kind === 'doctor' && <DoctorScreen doctor={doctor} />}
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
          {view.kind === 'help' && <HelpScreen />}
          {view.kind === 'prompts' && (
            <SavedPromptsScreen prompts={prompts.data} onChanged={() => void prompts.refresh()} />
          )}
          {view.kind === 'backup' && <BackupScreen />}
          {view.kind === 'tour' && config.data && (
            <TourScreen
              state={config.data.onboarding}
              onChanged={() => void config.refresh()}
              onFinish={() => navigate({ kind: 'sessions' })}
              onNavigate={(kind) => navigate({ kind })}
              onAddProject={setProjectAdd}
              onSearch={openSearch}
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
            const destination = hit.id;
            if (
              destination === 'sessions' ||
              destination === 'grid' ||
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
      <KeyboardShortcutsDialog
        open={overlay === 'shortcuts'}
        onOpenChange={(open) => setOverlay(open ? 'shortcuts' : undefined)}
        shortcuts={config.data?.shortcuts}
        onChanged={() => void config.refresh()}
      />
      <SettingsDialog
        open={overlay === 'settings'}
        onOpenChange={(open) => setOverlay(open ? 'settings' : undefined)}
        category={settingsCategory}
        doctor={doctor.data}
        doctorBusy={doctor.busy}
        onRecheck={() => void doctor.refresh()}
        onNavigate={(kind) => navigate({ kind })}
        onChanged={() => {
          void config.refresh();
          // A project's terminal theme override reaches its sessions through the project list.
          void projects.refresh();
        }}
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
      <UsageDialog
        open={overlay === 'usage'}
        onOpenChange={(open) => setOverlay(open ? 'usage' : undefined)}
        onSession={(id) => navigate({ kind: 'session', id })}
      />
      {cloneLink && (
        <CloneProjectDialog
          key={cloneLink.request}
          url={cloneLink.url}
          onCancel={() => setCloneLink(undefined)}
          onCloned={async (name) => {
            await projects.refresh();
            navigate({ kind: 'project', name });
          }}
        />
      )}
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
            setPendingView(undefined);
          }}
          onCancel={() => setPendingView(undefined)}
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
