import type { TreeRow } from '@mesa/core';
import { DEFAULT_SHORTCUTS, GENERAL_PROJECT } from '@mesa/core/browser';
import { useRef, useState } from 'react';
import { warned } from '@/components/Toast';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { CloneProjectDialog } from '@/features/projects/CloneProjectDialog';
import { ProjectAddDialog } from '@/features/projects/ProjectAddDialog';
import { CommandPalette } from '@/features/search/CommandPalette';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { useAppearance } from './hooks/useAppearance';
import { useAppMenu } from './hooks/useAppMenu';
import { useCloseGuard } from './hooks/useCloseGuard';
import { useCostAlerts } from './hooks/useCostAlerts';
import { useDiscoveryOffer } from './hooks/useDiscoveryOffer';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useInitialView } from './hooks/useInitialView';
import { useMesaLinks } from './hooks/useMesaLinks';
import { useNativeNotifications } from './hooks/useNativeNotifications';
import { usePrEventDelivery } from './hooks/usePrEventDelivery';
import { useSearchPalette } from './hooks/useSearchPalette';
import { useSortedProjects } from './hooks/useSortedProjects';
import { useStartSession } from './hooks/useStartSession';
import { useVisualAlert } from './hooks/useVisualAlert';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { paletteView } from './navigation';
import { QuitDialog } from './QuitDialog';
import { WorkspaceSidebar } from './sidebar/WorkspaceSidebar';
import { TitleBar } from './TitleBar';
import { UnsavedFilesDialog } from './UnsavedFilesDialog';
import { type SessionRequest, WorkspaceMain } from './WorkspaceMain';
import { WorkspaceOverlays } from './WorkspaceOverlays';

export function App() {
  const workspace = useWorkspaceNavigation();
  const { view, setView, navigate, navigateLatest, overlay, setOverlay } = workspace;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<TreeRow[]>([]);
  const search = useSearchPalette();
  const [archiveSessionRequest, setArchiveSessionRequest] = useState<SessionRequest>();
  const [dependencySessionRequest, setDependencySessionRequest] = useState<SessionRequest>();
  const [promptInsertRequest, setPromptInsertRequest] = useState<{
    session: string;
    text: string;
  }>();
  const [cloneLink, setCloneLink] = useState<{ url: string; request: number }>();
  const [projectAdd, setProjectAdd] = useState<ProjectAddRequest>();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const run = useRun();
  const { act } = useAct();
  const doctor = useCommand('doctor.run');
  const config = useCommand('config.get');
  const prompts = useCommand('prompts.list');
  const projects = useCommand('projects.list');
  const project =
    view.kind === 'project' ? projects.data?.find((p) => p.name === view.name) : undefined;
  const sorted = useSortedProjects(
    projects.data,
    sessions,
    view.kind === 'project' ? view.name : undefined,
  );
  const needsProfileSetup = config.error?.code === 'not_found';
  useInitialView({
    config: config.data,
    needsProfileSetup,
    projects: projects.data,
    sessions,
    setView,
  });
  useDiscoveryOffer({
    config: config.data,
    projects: projects.data,
    settingUp: needsProfileSetup || view.kind === 'setup',
    offer: () => setProjectAdd({ kind: 'discover', returnFocus: null }),
  });
  const profileInitialised = async () => {
    await Promise.all([config.refresh(), doctor.refresh(), prompts.refresh(), projects.refresh()]);
  };
  const startTour = () =>
    void act(async () => {
      // The tour's fields only, by path: discovery keeps its state.
      if (!(await run('config.set', { path: 'onboarding.step', value: 0 }))) return undefined;
      if (!(await run('config.set', { path: 'onboarding.status', value: 'active' })))
        return undefined;
      await config.refresh();
      navigate({ kind: 'tour' });
      return undefined;
    });
  const projectRegistered = async () => {
    await projects.refresh();
  };
  const quit = useCloseGuard(config.data);
  const waiting = useVisualAlert(config.data, sessions);
  useAppearance(config.data?.appearance);
  const shortcuts = config.data?.shortcuts ?? DEFAULT_SHORTCUTS;
  const canStart = projects.data?.some((entry) => entry.exists) ?? false;
  const { starting, requestNewSession } = useStartSession({
    view,
    sessions,
    projects: projects.data,
    navigate,
    navigateLatest,
  });
  useCostAlerts(navigateLatest);
  usePrEventDelivery(config.data?.sessions?.prEvents ?? false, sessions);
  const linkGuidance = useMesaLinks({
    session: (id) => navigateLatest({ kind: 'session', id }),
    clone: (url) => {
      setCloneLink((last) => ({ url, request: (last?.request ?? 0) + 1 }));
    },
    profileChanged: () =>
      setView((current) => (current.kind === 'session' ? { kind: 'sessions' } : current)),
  });
  useNativeNotifications(navigateLatest);
  useAppMenu(navigateLatest);
  useGlobalShortcuts({
    shortcuts,
    onSearch: () => (search.searchOpen ? search.closeSearch() : search.openSearch()),
    onKeyboardShortcuts: () => {
      search.closeSearch();
      setOverlay('shortcuts');
    },
    onBoard: () => navigate({ kind: 'sessions' }),
    onNewSession: () => {
      if (canStart) requestNewSession();
    },
  });
  return (
    <div className="flex h-screen min-h-[480px] flex-col">
      <TitleBar
        view={view}
        navigate={navigate}
        overlay={overlay}
        onOverlay={setOverlay}
        onSettings={workspace.openSettings}
        searchShortcut={shortcuts.search}
        onSearch={search.openSearch}
        projects={projects.data}
        currentProject={project?.name}
        canStart={canStart}
        onNewSession={requestNewSession}
        doctor={doctor.data}
        onRecheck={doctor.refresh}
        profileMenu={profileMenu}
      />
      {linkGuidance && (
        <p role="status" data-testid="mesa-link-guidance" className="px-6 py-2 text-sm">
          {linkGuidance}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar
          view={view}
          onView={navigate}
          projects={sorted.sorted ?? projects.data ?? []}
          sort={sorted.sort}
          onSort={sorted.setSort}
          sessions={sessions}
          waiting={waiting}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onAddProject={setProjectAdd}
          starting={starting}
          lastSession={workspace.lastSession}
          lastProject={workspace.lastProject}
          onNewSession={(project, location, parent) =>
            requestNewSession({
              ...(project === GENERAL_PROJECT ? { general: true } : { project }),
              location,
              parent,
            })
          }
          onArchiveSession={(id) => {
            navigate({ kind: 'session', id });
            setArchiveSessionRequest((request) => ({
              count: (request?.count ?? 0) + 1,
              ids: [id],
            }));
          }}
          onArchiveSessions={(ids) =>
            setArchiveSessionRequest((request) => ({ count: (request?.count ?? 0) + 1, ids }))
          }
          onDependencySession={(id) => {
            navigate({ kind: 'session', id });
            setDependencySessionRequest((request) => ({
              count: (request?.count ?? 0) + 1,
              ids: [id],
            }));
          }}
        />
        <WorkspaceMain
          view={view}
          project={project}
          navigate={navigate}
          config={config}
          projects={projects}
          needsProfileSetup={needsProfileSetup}
          onProfileInitialised={profileInitialised}
          onStartTour={startTour}
          prompts={prompts}
          doctor={doctor}
          sessions={sessions}
          onRowsChange={setSessions}
          filesDirty={workspace.filesDirty}
          onFilesDirtyChange={workspace.setFilesDirty}
          onNewSession={requestNewSession}
          onAddProject={setProjectAdd}
          onSearch={search.openSearch}
          onVaultSettings={() => workspace.openSettings('general')}
          archiveSessionRequest={archiveSessionRequest}
          dependencySessionRequest={dependencySessionRequest}
          promptInsertRequest={promptInsertRequest}
        />
      </div>
      <CommandPalette
        open={search.searchOpen}
        onClose={search.closeSearch}
        projects={projects.data ?? []}
        sessions={sessions}
        prompts={view.kind === 'session' ? prompts.data : undefined}
        returnFocus={search.returnFocus.current}
        onSelect={(hit) => {
          const target = paletteView(hit);
          if (hit.kind === 'prompt' && view.kind === 'session') {
            const saved = prompts.data?.find((prompt) => prompt.name === hit.id);
            if (saved) setPromptInsertRequest({ session: view.id, text: saved.text });
          } else if (target) navigate(target);
          else if (hit.id === 'new-session') requestNewSession();
          else if (hit.id === 'open-vault') {
            void act(async () => warned((await run('vault.open'))?.warning));
          } else if (hit.id === 'profile') {
            if (profileMenu.current) profileMenu.current.open = true;
            profileMenu.current?.querySelector('summary')?.focus();
          }
        }}
      />
      <WorkspaceOverlays
        overlay={overlay}
        onOverlay={setOverlay}
        settingsCategory={workspace.settingsCategory}
        config={config}
        doctor={doctor}
        onProjectsChanged={() => void projects.refresh()}
        navigate={navigate}
        onReplayTour={startTour}
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
      {projectAdd && (
        <ProjectAddDialog
          request={projectAdd}
          onCancel={() => setProjectAdd(undefined)}
          onRegistered={projectRegistered}
        />
      )}
      {workspace.pendingView && (
        <UnsavedFilesDialog
          onDiscard={workspace.discardPending}
          onCancel={workspace.cancelPending}
        />
      )}
      {quit.quitOpen && (
        <QuitDialog closing={quit.closing} onQuit={quit.confirmQuit} onCancel={quit.cancelQuit} />
      )}
    </div>
  );
}
