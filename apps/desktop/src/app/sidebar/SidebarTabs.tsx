import { cn } from '@/lib/utils';

/** The sidebar's Sessions and Projects tabs; Sessions counts its sessions and dots while any wait. */
export function SidebarTabs(props: {
  projectTab: boolean;
  /** The active and recoverable sessions listed. */
  sessionCount: number;
  /** The visual alert's count (0 when it is off). */
  waiting: number;
  onSessions: () => void;
  onProjects: () => void;
}) {
  const { projectTab, waiting } = props;
  return (
    <div role="tablist" aria-label="Workspace" className="flex min-w-0 flex-1">
      <button
        type="button"
        role="tab"
        aria-selected={!projectTab}
        className={cn(
          'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
          !projectTab && 'border-ring text-foreground',
        )}
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
        aria-selected={projectTab}
        className={cn(
          'flex-1 border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground',
          projectTab && 'border-ring text-foreground',
        )}
        onClick={props.onProjects}
      >
        Projects
      </button>
    </div>
  );
}
