import type { ProjectRow, TreeRow } from '@mesa/core';
import { Folder } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AutomationsTab } from '@/features/automations/AutomationsTab';
import { FilesTab } from '@/features/files/FilesTab';
import { GitTab } from '@/features/git/GitTab';
import { useGitChangeCount } from '@/features/git/useGitChangeCount';
import { InstructionsTab } from '@/features/instructions/InstructionsTab';
import { SkillsTab } from '@/features/skills/SkillsTab';
import { TicketsTab } from '@/features/tickets/TicketsTab';
import { VaultTab } from '@/features/vault/VaultTab';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ImportTab } from './import/ImportTab';
import { OverviewTab } from './overview/OverviewTab';
import { useOverviewState } from './overview/useOverviewState';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { ProjectTabBar } from './ProjectTabBar';

/** A project page's tabs. */
export type ProjectTab =
  | 'overview'
  | 'vault'
  | 'import'
  | 'tickets'
  | 'git'
  | 'files'
  | 'skills'
  | 'instructions'
  | 'automations';

/** The selected project's existing information and effective skills, in its own workspace. */
export function ProjectScreen(props: {
  project: ProjectRow;
  vault?: string;
  /** The tab it opens on: the one it was left on, so coming back keeps it. */
  initialTab?: ProjectTab;
  onTabChange?: (tab: ProjectTab) => void;
  sessions: readonly TreeRow[];
  onSession: (id: string) => void;
  /** Opens the Vault screen with this item selected. */
  onVaultItem: (path: string) => void;
  onChanged: () => void;
  onUnregistered: () => void;
  filesDirty: boolean;
  file?: { checkout: string; path: string; line: number };
  onFilesDirtyChange: (dirty: boolean) => void;
  /** A session at once, in `checkout` (an existing linked worktree) when given. */
  onNewSession: (
    project: string,
    kind: 'main' | 'worktree' | 'terminal',
    checkout?: string,
  ) => void;
  onAgentSettings: () => void;
}) {
  const { project } = props;
  const [tab, setTab] = useState<ProjectTab>(props.initialTab ?? 'overview');
  useEffect(() => {
    if (props.file) setTab('files');
  }, [props.file]);
  const onTabChange = useRef(props.onTabChange);
  onTabChange.current = props.onTabChange;
  useEffect(() => onTabChange.current?.(tab), [tab]);
  const overview = useOverviewState(project);
  const worktrees = useCommand('worktrees.list', { project: project.name });
  const [gitRevision, setGitRevision] = useState(0);
  const gitChanges = useGitChangeCount(project.name, gitRevision);
  const { acting, act } = useAct();
  const run = useRun();
  // Start session on an imported item: its goal fills in the Overview's composer, to edit there.
  const startFrom = (from: string) =>
    void act(async () => {
      const built = await run('imports.goal', { project: project.name, from });
      if (!built) return undefined;
      overview.setDraft({ from: built.id, title: built.title, goal: built.goal });
      setTab('overview');
      return undefined;
    });
  return (
    <section data-testid="project-workspace" className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-card text-ring">
          <Folder aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{project.label}</h2>
          <p className="sr-only">
            {project.name} · {project.path}
          </p>
        </div>
        <ProjectActionsMenu
          project={project}
          acting={acting}
          act={act}
          onChanged={props.onChanged}
          onUnregistered={props.onUnregistered}
        />
      </div>
      <ProjectTabBar
        project={project.name}
        tab={tab}
        gitChanges={gitChanges}
        filesDirty={props.filesDirty}
        onTab={setTab}
        onDiscard={() => props.onFilesDirtyChange(false)}
      />
      {tab === 'overview' ? (
        <OverviewTab
          project={project}
          sessions={props.sessions}
          worktrees={worktrees}
          state={overview}
          acting={acting}
          act={act}
          onSession={props.onSession}
          onNewSession={props.onNewSession}
        />
      ) : tab === 'vault' ? (
        <VaultTab
          key={props.vault}
          vault={props.vault}
          project={project.name}
          onItem={props.onVaultItem}
          onImport={() => setTab('import')}
        />
      ) : tab === 'import' ? (
        <ImportTab key={project.name} project={project.name} onStartSession={startFrom} />
      ) : tab === 'tickets' ? (
        <TicketsTab key={project.name} project={project.name} onSession={props.onSession} />
      ) : tab === 'git' ? (
        <GitTab
          key={project.name}
          project={project.name}
          onChanged={() => setGitRevision((last) => last + 1)}
        />
      ) : tab === 'files' ? (
        <FilesTab
          key={project.name}
          project={project.name}
          onDirtyChange={props.onFilesDirtyChange}
          target={props.file}
        />
      ) : tab === 'skills' ? (
        <SkillsTab
          project={project.name}
          onDirtyChange={props.onFilesDirtyChange}
          onAgentSettings={props.onAgentSettings}
        />
      ) : tab === 'instructions' ? (
        <InstructionsTab project={project.name} onDirtyChange={props.onFilesDirtyChange} />
      ) : (
        <AutomationsTab key={project.name} project={project.name} />
      )}
    </section>
  );
}
