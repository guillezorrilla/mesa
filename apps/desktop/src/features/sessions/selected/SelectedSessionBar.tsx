import type { Agent, ProjectRow, TreeRow } from '@mesa/core';
import {
  GENERAL_PROJECT,
  projectLabel,
  recoverable,
  reviewable,
  sessionTitle,
} from '@mesa/core/browser';
import { Archive, GitCompareArrows, Globe, MessageSquareQuote } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AutomationBanner } from '@/features/automations/AutomationBanner';
import type { OpenDialog } from '../dialogs/SessionDialogs';
import { AgentSwitcher } from './AgentSwitcher';
import { SelectedSessionDetails } from './SelectedSessionDetails';

/**
 * The selected session's bar: its project and title, details, agent, the Review, Browser and Diff
 * toggles, Archive, and then `children` (its Session actions menu).
 */
export function SelectedSessionBar({
  sessionId,
  row,
  projects,
  acting,
  reviewOpen,
  browserOpen,
  diffOpen,
  onProject,
  onSessions,
  onSwap,
  onToggleReview,
  onToggleBrowser,
  onToggleDiff,
  onDialog,
  children,
}: {
  sessionId: string;
  row?: TreeRow;
  projects?: readonly ProjectRow[];
  acting: boolean;
  reviewOpen: boolean;
  browserOpen: boolean;
  diffOpen: boolean;
  onProject?: (project: string) => void;
  onSessions?: () => void;
  onSwap: (id: string, agent: Agent) => void;
  onToggleReview: () => void;
  onToggleBrowser: () => void;
  onToggleDiff: () => void;
  onDialog: (dialog: OpenDialog) => void;
  children?: ReactNode;
}) {
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
          aria-label="Review responses"
          aria-pressed={reviewOpen}
          onClick={onToggleReview}
        >
          <MessageSquareQuote aria-hidden /> Review
        </Button>
      )}
      {row?.managed && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open session browser"
          aria-pressed={browserOpen}
          onClick={onToggleBrowser}
        >
          <Globe aria-hidden /> Browser
        </Button>
      )}
      {row?.managed && row.project !== GENERAL_PROJECT && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Show session changes"
          aria-pressed={diffOpen}
          title="Everything this session changed since its base branch"
          onClick={onToggleDiff}
        >
          <GitCompareArrows aria-hidden /> Diff
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
