import { cn } from '@/lib/utils';

/** The sidebar's tabs. */
export type SidebarTab = 'sessions' | 'projects' | 'reviews';

const TAB = 'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground';
const ON = 'border-ring text-foreground';

/**
 * The sidebar's Sessions, Projects and Reviews tabs; Sessions counts its sessions and dots while
 * any wait, Reviews counts the PRs that ask something of me.
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
}) {
  const { tab, waiting } = props;
  return (
    <div role="tablist" aria-label="Workspace" className="flex min-w-0 flex-1">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'sessions'}
        className={cn(TAB, tab === 'sessions' && ON)}
        onClick={props.onSessions}
      >
        Sessions <span className="rounded bg-muted px-1">{props.sessionCount}</span>
        {waiting > 0 && (
          <span
            data-testid="sessions-waiting"
            role="img"
            aria-label={`${waiting} waiting for input`}
            className="ml-1 inline-block size-2 rounded-full bg-state-waiting align-middle"
          />
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'projects'}
        className={cn(TAB, tab === 'projects' && ON)}
        onClick={props.onProjects}
      >
        Projects
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'reviews'}
        className={cn(TAB, tab === 'reviews' && ON)}
        onClick={props.onReviews}
      >
        Reviews
        {props.reviewCount > 0 && (
          <span
            data-testid="reviews-count"
            className="ml-1 rounded bg-state-working px-1 text-background"
          >
            {props.reviewCount}
          </span>
        )}
      </button>
    </div>
  );
}
