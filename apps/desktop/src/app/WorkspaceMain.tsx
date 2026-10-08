import type { Config, DoctorReport, ProjectRow, SavedPrompt, TreeRow } from '@mesa/core';
import { useCallback, useRef } from 'react';
import { Muted } from '@/components/Muted';
import { AboutScreen } from '@/features/about/AboutScreen';
import { AutomationsScreen } from '@/features/automations/AutomationsScreen';
import { BackupScreen } from '@/features/backup/BackupScreen';
import { DailyScreen } from '@/features/daily/DailyScreen';
import { DoctorScreen } from '@/features/doctor/DoctorScreen';
import { HelpScreen } from '@/features/help/HelpScreen';
import { HooksUpdateCard } from '@/features/hooks/HooksUpdateCard';
import { MapScreen } from '@/features/map/MapScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { ProjectScreen, type ProjectTab } from '@/features/projects/ProjectScreen';
import { SavedPromptsScreen } from '@/features/prompts/SavedPromptsScreen';
import { SessionsScreen } from '@/features/sessions/SessionsScreen';
import type { SessionPreset } from '@/features/sessions/start/useStartSession';
import { SmarterDecisionsTip } from '@/features/settings/decisions/SmarterDecisionsTip';
import { VaultScreen } from '@/features/vault/VaultScreen';
import { type CommandState, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/lib/workspaceView';

/** A sidebar request the Sessions screen acts on once per new `count`. */
export type SessionRequest = { count: number; ids: string[] };

/** The main pane: the screen for the view. */
export function WorkspaceMain(props: {
  view: WorkspaceView;
  /** The project in view, when it is listed. */
  project?: ProjectRow;
  navigate: (view: WorkspaceView) => void;
  config: CommandState<Config>;
  projects: CommandState<ProjectRow[]>;
  needsProfileSetup: boolean;
  onProfileInitialised: () => Promise<void>;
  prompts: CommandState<SavedPrompt[]>;
  doctor: CommandState<DoctorReport>;
  sessions: readonly TreeRow[];
  onRowsChange: (rows: TreeRow[]) => void;
  filesDirty: boolean;
  onFilesDirtyChange: (dirty: boolean) => void;
  onNewSession: (preset: SessionPreset) => void;
  onAddProject: (request: ProjectAddRequest) => void;
  onProjectUnregistered: (name: string) => void;
  onVaultSettings: () => void;
  archiveSessionRequest?: SessionRequest;
  dependencySessionRequest?: SessionRequest;
  promptInsertRequest?: { session: string; text: string };
}) {
  const { view, project, navigate, config, projects, prompts, needsProfileSetup } = props;
  // Each project's tab, so going back to one keeps it.
  const projectTabs = useRef<Record<string, ProjectTab>>({});
  const run = useRun();
  const openFileLink = useCallback(
    (session: string, target: string) => {
      void run('files.link', { session, target }).then((file) => {
        if (file) navigate({ kind: 'project', name: file.project, file });
      });
    },
    [navigate, run],
  );
  const sessionView = view.kind === 'session';
  const startView = view.kind === 'sessions';
  return (
    <main
      className={
        sessionView
          ? 'min-w-0 flex-1 overflow-hidden'
          : cn('min-w-0 flex-1 overflow-auto px-6 py-5', startView && 'flex flex-col gap-4')
      }
    >
      {startView && (
        <>
          <HooksUpdateCard />
          <SmarterDecisionsTip config={config.data} onChanged={() => void config.refresh()} />
        </>
      )}
      {/* Sessions stays mounted so its terminal clients survive navigation. */}
      <div
        hidden={!startView && view.kind !== 'grid' && !sessionView}
        className={sessionView ? 'h-full' : startView ? 'min-h-0 flex-1' : undefined}
      >
        <SessionsScreen
          onAddProject={props.onAddProject}
          gridMode={view.kind === 'grid'}
          gridGroups={config.data?.grid?.groups}
          onGridGroupsChanged={() => void config.refresh()}
          selectedSession={view.kind === 'session' ? view.id : undefined}
          projects={projects.data ?? (needsProfileSetup ? [] : undefined)}
          projectsError={needsProfileSetup ? undefined : projects.error?.message}
          onRetryProjects={() => void projects.refresh()}
          onRowsChange={props.onRowsChange}
          onSessions={() => navigate({ kind: 'sessions' })}
          onProject={(name) => navigate({ kind: 'project', name })}
          archiveSessionRequest={props.archiveSessionRequest}
          dependencySessionRequest={props.dependencySessionRequest}
          terminalPreferences={config.data?.terminal}
          savedPrompts={prompts.data}
          promptInsertRequest={props.promptInsertRequest}
          onSelectSession={(id) => navigate({ kind: 'session', id })}
          onFileLink={openFileLink}
        />
      </div>
      {view.kind === 'project' &&
        (project ? (
          <ProjectScreen
            key={project.name}
            project={project}
            vault={config.data?.vault}
            initialTab={projectTabs.current[project.name]}
            onTabChange={(tab) => {
              projectTabs.current[project.name] = tab;
            }}
            filesDirty={props.filesDirty}
            file={view.file}
            onFilesDirtyChange={props.onFilesDirtyChange}
            sessions={props.sessions}
            onSession={(id) => navigate({ kind: 'session', id })}
            onVaultItem={(path) => navigate({ kind: 'vault', path })}
            onNewSession={(project, location, checkout) =>
              props.onNewSession({ project, location, checkout })
            }
            onAgentSettings={() => navigate({ kind: 'doctor' })}
            onChanged={() => void projects.refresh()}
            onUnregistered={() => props.onProjectUnregistered(project.name)}
          />
        ) : projects.busy || !projects.data ? (
          <Muted>Loading project...</Muted>
        ) : (
          <Muted>Project unavailable. Choose another project from the sidebar.</Muted>
        ))}
      {view.kind === 'doctor' && <DoctorScreen doctor={props.doctor} />}
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
        <VaultScreen
          key={JSON.stringify([config.data?.vault, view.query])}
          query={view.query}
          path={view.path}
          onSettings={props.onVaultSettings}
        />
      )}
      {view.kind === 'help' && <HelpScreen />}
      {view.kind === 'about' && <AboutScreen />}
      {view.kind === 'prompts' && (
        <SavedPromptsScreen prompts={prompts.data} onChanged={() => void prompts.refresh()} />
      )}
      {view.kind === 'automations' && <AutomationsScreen />}
      {view.kind === 'backup' && <BackupScreen />}
      {view.kind === 'onboarding' && (
        <OnboardingScreen
          doctor={props.doctor}
          config={config.data}
          projects={projects.data ?? []}
          onInitialised={props.onProfileInitialised}
          onConfigChanged={config.refresh}
          onProjectsChanged={projects.refresh}
          onDone={(session) =>
            navigate(session ? { kind: 'session', id: session } : { kind: 'sessions' })
          }
        />
      )}
    </main>
  );
}
