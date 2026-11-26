import {
  FolderGit2,
  GitPullRequest,
  type LucideIcon,
  ScrollText,
  SquareTerminal,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { CountPill } from '@/components/CountPill';
import { cn } from '@/lib/utils';

/** The sidebar's tabs. */
export type SidebarTab = 'sessions' | 'projects' | 'reviews' | 'logs';

/**
 * One tab: its icon and label, the label hidden (still its name) on the inactive tabs while the
 * sidebar is too narrow for all four.
 */
function Tab(props: {
  on: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.on}
      title={props.label}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground',
        props.on && 'border-ring text-foreground',
      )}
      onClick={props.onClick}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className={props.on ? undefined : 'sr-only @min-[21rem]:not-sr-only'}>
        {props.label}
      </span>
      {props.children}
    </button>
  );
}

/**
 * The sidebar's Sessions, Projects, Reviews and Logs tabs; Sessions counts its sessions and dots
 * while any wait, Reviews counts the PRs that ask something of me.
 */
export function SidebarTabs(props: {
  tab: SidebarTab;
  /** The active and recoverable sessions listed. */
  sessionCount: number;
  /** The visual alert's count (0 when it is off). */
  waiting: number;
  /** PRs that need my review or changed since it. */
  reviewCount: number;
  onSessions: () => void;
  onProjects: () => void;
  onReviews: () => void;
  /** The Logs tab (CONTEXT.md, Cloud Logs), unless logs.cloudTab hides it. */
  onLogs?: () => void;
}) {
  const { tab, waiting } = props;
  return (
    <div role="tablist" aria-label="Workspace" className="@container flex min-w-0 flex-1 gap-0.5">
      <Tab
        on={tab === 'sessions'}
        icon={SquareTerminal}
        label="Sessions"
        onClick={props.onSessions}
      >
        <span className="rounded bg-muted px-1">{props.sessionCount}</span>
        {waiting > 0 && (
          <span
            data-testid="sessions-waiting"
            role="img"
            aria-label={`${waiting} waiting for input`}
            className="inline-block size-2 rounded-full bg-state-waiting"
          />
        )}
      </Tab>
      <Tab on={tab === 'projects'} icon={FolderGit2} label="Projects" onClick={props.onProjects} />
      <Tab on={tab === 'reviews'} icon={GitPullRequest} label="Reviews" onClick={props.onReviews}>
        {props.reviewCount > 0 && (
          <CountPill
            count={props.reviewCount}
            className="rounded bg-state-working px-1 text-background"
          />
        )}
      </Tab>
      {props.onLogs && (
        <Tab on={tab === 'logs'} icon={ScrollText} label="Logs" onClick={props.onLogs} />
      )}
    </div>
  );
}
