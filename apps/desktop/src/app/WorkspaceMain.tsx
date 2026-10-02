import type { Config, DoctorReport, ProjectRow, SavedPrompt, TreeRow } from '@mesa/core';
import { useCallback, useRef } from 'react';
import { Muted } from '@/components/Muted';
import { BackupScreen } from '@/features/backup/BackupScreen';
import { DailyScreen } from '@/features/daily/DailyScreen';
import { DoctorScreen } from '@/features/doctor/DoctorScreen';
import { HelpScreen } from '@/features/help/HelpScreen';
import { MapScreen } from '@/features/map/MapScreen';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { ProjectScreen, type ProjectTab } from '@/features/projects/ProjectScreen';
import { SavedPromptsScreen } from '@/features/prompts/SavedPromptsScreen';
import { SessionsScreen } from '@/features/sessions/SessionsScreen';
import { TourScreen } from '@/features/tour/TourScreen';
import { VaultScreen } from '@/features/vault/VaultScreen';
import { type CommandState, useRun } from '@/lib/useCommand';
import type { WorkspaceView } from './navigation';
import type { SessionPreset } from './useStartSession';

/** A sidebar request the Sessions screen acts on once per new `count`. */
export type SessionRequest = { count: number; id: string };

/** The main pane: the screen for the view. */
export function WorkspaceMain(props: {
  view: WorkspaceView;
  /** The project in view, when it is listed. */
  project?: ProjectRow;
  navigate: (view: WorkspaceView) => void;
  config: CommandState<Config>;
  projects: CommandState<ProjectRow[]>;
  needsProfileSetup: boolean;
  prompts: CommandState<SavedPrompt[]>;
  doctor: CommandState<DoctorReport>;
  sessions: readonly TreeRow[];
  onRowsChange: (rows: TreeRow[]) => void;
  filesDirty: boolean;
  onFilesDirtyChange: (dirty: boolean) => void;
  onNewSession: (preset: SessionPreset) => void;
  onAddProject: (request: ProjectAddRequest) => void;
  onSearch: () => void;
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
  return (
    <main
      className={
        sessionView ? 'min-w-0 flex-1 overflow-hidden' : 'min-w-0 flex-1 overflow-auto px-6 py-5'
      }
    >
      {/* Sessions stays mounted so its terminal clients survive navigation. */}
      <div
        hidden={view.kind !== 'sessions' && view.kind !== 'grid' && !sessionView}
        className={sessionView || view.kind === 'sessions' ? 'h-full' : undefined}
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
            onUnregistered={() => {
              void projects.refresh();
              navigate({ kind: 'sessions' });
            }}
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
          onAddProject={props.onAddProject}
          onSearch={props.onSearch}
        />
      )}
    </main>
  );
}
