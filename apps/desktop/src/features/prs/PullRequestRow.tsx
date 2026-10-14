import type { PrRow } from '@mesa/core';
import { shortAgo } from '@mesa/core/browser';
import { cn } from '@/lib/utils';

const TAG: Partial<Record<PrRow['bucket'], { label: string; className: string }>> = {
  need: { label: 'Review', className: 'bg-state-working/10 text-state-working' },
  updated: { label: 'Updated', className: 'bg-state-waiting/15 text-state-waiting' },
};

/**
 * One PR in the Reviews list: its title, then `#n · author · age`, with a tag only when it asks
 * something of me; waiting rows are dimmed. Opens the PR on its provider until the detail exists.
 */
export function PullRequestRow(props: { pr: PrRow; showProject?: boolean; now: number }) {
  const { pr } = props;
  const tag = TAG[pr.bucket];
  const quiet = pr.bucket === 'waiting' || pr.bucket === 'other';
  return (
    <a
      data-testid="pr-row"
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title={pr.title}
      className="grid grid-cols-[1fr_auto] items-center gap-x-2 rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        className={cn('truncate text-sm font-medium', quiet && 'font-normal text-muted-foreground')}
      >
        {pr.title}
      </span>
      {tag ? (
        <span
          className={cn(
            'row-span-2 rounded px-1.5 py-0.5 text-[11px] font-semibold',
            tag.className,
          )}
        >
          {tag.label}
        </span>
      ) : (
        <span className="row-span-2" />
      )}
      <span className="truncate text-xs text-muted-foreground tabular-nums">
        {props.showProject ? `${pr.project} · ` : ''}#{pr.number} · {pr.author} ·{' '}
        {shortAgo(pr.updatedAt, props.now)}
      </span>
    </a>
  );
}
