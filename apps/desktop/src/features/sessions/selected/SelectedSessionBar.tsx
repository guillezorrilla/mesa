import type { Agent, ProjectRow, TreeRow } from '@mesa/core';
import {
  diffable,
  GENERAL_PROJECT,
  projectLabel,
  recoverable,
  reviewable,
  sessionTitle,
} from '@mesa/core/browser';
import { Archive, GitCompareArrows, Globe, MessageSquareQuote, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AutomationBanner } from '@/features/automations/AutomationBanner';
import { useCommand } from '@/lib/useCommand';
import type { OpenDialog } from '../dialogs/SessionDialogs';
import { AgentSwitcher } from './AgentSwitcher';
import { SelectedSessionDetails } from './SelectedSessionDetails';
import type { SidePanel } from './useSidePanel';

/**
 * The selected session's bar: its project and title, details, agent, the Replies, Browser, Diff and
 * Crew (with children or tasks) toggles, Archive, and then `children` (its Session actions menu).
 */
export function SelectedSessionBar({
  sessionId,
  row,
  projects,
  acting,
  panel,
  onProject,
  onSessions,
  onSwap,
  onTogglePanel,
  onDialog,
  children,
}: {
  sessionId: string;
  row?: TreeRow;
  projects?: readonly ProjectRow[];
  acting: boolean;
  /** The side panel open beside the terminal, if any. */
  panel?: SidePanel;
  onProject?: (project: string) => void;
  onSessions?: () => void;
  onSwap: (id: string, agent: Agent) => void;
  onTogglePanel: (panel: SidePanel) => void;
  onDialog: (dialog: OpenDialog) => void;
  children?: ReactNode;
}) {
  // A session that coordinates tasks has a Crew too, before it has any worker.
  const coordinates = Boolean(
    useCommand('tasks.list', { coordinator: sessionId }).data?.tasks.length,
  );
  return (
    <div
      data-testid="selected-session"
      className="flex min-h-12 shrink-0 items-center gap-2 border-b bg-card/40 px-4 text-sm"
    >
      <Button
        variant="ghost"
        size="sm"
        className="px-0 text-muted-foreground"
        onClick={() =>
          row?.project && row.project !== GENERAL_PROJECT && onProject
            ? onProject(row.project)
            : onSessions?.()
        }
      >
        {projectLabel(row?.project ?? null)}
      </Button>
      <span className="text-muted-foreground">/</span>
      <span className="truncate font-medium">{row ? sessionTitle(row) : sessionId}</span>
      {row?.managed && row.automation && <AutomationBanner rule={row.automation.rule} />}
      {row?.managed && (
        <SelectedSessionDetails
          key={row.id}
          row={row}
          projectPath={projects?.find((project) => project.name === row.project)?.path}
        />
      )}
      <span className="ml-auto" />
      {row?.managed && row.kind === 'interactive' && row.agent !== 'terminal' && !row.background ? (
        <AgentSwitcher
          row={row}
          disabled={acting}
          onSwap={(agent) => onSwap(row.id, agent)}
          onHandoff={(agent) => onDialog({ kind: 'handoff', row, agent })}
        />
      ) : (
        <span className="text-xs text-muted-foreground">{row?.agent}</span>
      )}
      {row && reviewable(row) && (
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={panel === 'review'}
          onClick={() => onTogglePanel('review')}
        >
          <MessageSquareQuote aria-hidden /> Replies
        </Button>
      )}
      {row?.managed && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open session browser"
          aria-pressed={panel === 'browser'}
          onClick={() => onTogglePanel('browser')}
        >
          <Globe aria-hidden /> Browser
        </Button>
      )}
      {row && diffable(row) && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Show session changes"
          aria-pressed={panel === 'diff'}
          title="Everything this session changed since its base branch"
          onClick={() => onTogglePanel('diff')}
        >
          <GitCompareArrows aria-hidden /> Diff
        </Button>
      )}
      {row?.managed && (row.children.length > 0 || coordinates) && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Show crew"
          aria-pressed={panel === 'crew'}
          title="This session's workers and what each last reported"
          onClick={() => onTogglePanel('crew')}
        >
          <Users aria-hidden /> Crew
        </Button>
      )}
      {row && recoverable(row) && (
        <span className="text-xs text-state-waiting">Terminal ended</span>
      )}
      {row?.managed && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Archive session"
          onClick={() => onDialog({ kind: 'archive', rows: [row] })}
        >
          <Archive aria-hidden />
        </Button>
      )}
      {children}
    </div>
  );
}
