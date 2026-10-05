import type { ManagedRow, ProjectRow, TreeRow } from '@mesa/core';
import { sessionProjects } from '@mesa/core/browser';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { WorktreesSection } from '@/features/worktrees/WorktreesSection';
import type { DataOf } from '@/lib/client';
import type { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { useRun } from '@/lib/useCommand';
import { ActiveSessions } from './ActiveSessions';
import { QuickSession } from './QuickSession';
import { RecentSessions } from './RecentSessions';
import { SessionComposer, type SessionStartInput } from './SessionComposer';
import type { OverviewState } from './useOverviewState';

/**
 * The project's Overview tab: start a session, and its sessions (those where it is additional too)
 * and worktrees. Its vault and its context have their own tabs.
 */
export function OverviewTab(props: {
  project: ProjectRow;
  sessions: readonly TreeRow[];
  worktrees: CommandState<DataOf<'worktrees.list'>>;
  /** Its view state, kept by the screen across tab switches. */
  state: OverviewState;
  /** The screen's one action at a time, shared with its other actions. */
  acting: boolean;
  act: ReturnType<typeof useAct>['act'];
  onSession: (id: string) => void;
  onNewSession: (
    project: string,
    kind: 'main' | 'worktree' | 'terminal',
    checkout?: string,
  ) => void;
}) {
  const { project, worktrees, acting } = props;
  const run = useRun();
  const sessions = props.sessions.filter(
    (s): s is TreeRow & ManagedRow => s.managed && sessionProjects(s).includes(project.name),
  );
  const open = (input: SessionStartInput) =>
    props.act(async () => {
      const session = await run('sessions.open', { project: project.name, ...input });
      if (!session) return undefined;
      if (input.from) props.state.setDraft(undefined);
      props.state.setAdditional([]);
      props.onSession(session.id);
      return said(`Opened session ${session.id} on ${project.name}`, session);
    });
  return (
    <div className="space-y-8">
      <SessionComposer
        project={project}
        state={props.state}
        busy={acting}
        onStart={(input) => void open(input)}
      />
      <ActiveSessions
        project={project.name}
        sessions={sessions}
        mainBranch={worktrees.data?.find((tree) => tree.main)?.branch}
        onSession={props.onSession}
      >
        <QuickSession
          disabled={!project.exists || acting}
          onStart={() => void open({})}
          onNewSession={(kind) => props.onNewSession(project.name, kind)}
        />
      </ActiveSessions>
      {worktrees.data && worktrees.data.length > 0 && (
        <WorktreesSection
          project={project.name}
          exists={project.exists}
          worktrees={worktrees}
          onSession={props.onSession}
          onNewSession={(checkout) => props.onNewSession(project.name, 'main', checkout)}
          onNewWorktree={() => props.onNewSession(project.name, 'worktree')}
        />
      )}
      <RecentSessions
        project={project.name}
        sessions={sessions}
        state={props.state}
        onSession={props.onSession}
      />
      {!project.exists && <Badge variant="destructive">Folder unavailable</Badge>}
    </div>
  );
}
