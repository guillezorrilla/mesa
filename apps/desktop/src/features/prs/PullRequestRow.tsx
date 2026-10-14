import type { PrRow } from '@mesa/core';
import { shortAgo } from '@mesa/core/browser';
import { cn } from '@/lib/utils';
import { PR_TONE } from './prTone';

const TAG: Partial<Record<PrRow['bucket'], { label: string; className: string }>> = {
  need: { label: 'Review', className: cn(PR_TONE.need.box, PR_TONE.need.text) },
  updated: { label: 'Updated', className: cn(PR_TONE.updated.box, PR_TONE.updated.text) },
};
const REVIEWING = { label: 'Reviewing', className: cn(PR_TONE.need.box, PR_TONE.need.text) };

/**
 * One PR in the Reviews list: its title, then `#n · author · age`, with a tag only when it asks
 * something of me; waiting rows are dimmed. Opens its detail; marked while that is shown.
 */
export function PullRequestRow(props: {
  pr: PrRow;
  showProject?: boolean;
  now: number;
  current?: boolean;
  /** A live review session works on it. */
  reviewing?: boolean;
  onOpen: (pr: PrRow) => void;
}) {
  const { pr } = props;
  const tag = props.reviewing ? REVIEWING : TAG[pr.bucket];
  const quiet = pr.bucket === 'waiting' || pr.bucket === 'other';
  return (
    <button
      type="button"
      data-testid="pr-row"
      aria-current={props.current ? 'page' : undefined}
      title={pr.title}
      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-accent"
      onClick={() => props.onOpen(pr)}
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
    </button>
  );
}
