import type { PrSetupRow } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { ReviewsList } from './ReviewsList';
import { useGrouping } from './useGrouping';
import type { usePrs } from './usePrs';

/** The sidebar's Reviews tab: the grouping toggle, the list, and when it was read with Refresh. */
export function ReviewsSection(props: {
  prs: ReturnType<typeof usePrs>;
  projects: readonly string[];
  onSetup: (row: PrSetupRow) => void;
}) {
  const { list, readAt } = props.prs;
  const [by, setBy] = useGrouping();
  const now = Date.now();
  return (
    <div className="flex h-full flex-col gap-3">
      <SegmentedControl
        label="Group by"
        wide
        options={[
          ['project', 'By project'],
          ['status', 'By status'],
        ]}
        value={by}
        onChange={setBy}
      />
      <div className="min-h-0 flex-1">
        {list.data ? (
          <ReviewsList
            list={list.data}
            by={by}
            projects={props.projects}
            onSetup={props.onSetup}
            now={now}
          />
        ) : (
          <Muted className="px-2">
            {list.error ? list.error.message : 'Reading pull requests...'}
          </Muted>
        )}
      </div>
      <div className="flex items-center justify-between border-t px-1 pt-2 text-xs text-muted-foreground">
        <span data-testid="reviews-read-at">
          {readAt ? `Checked ${timeAgo(new Date(readAt).toISOString(), now)}` : ''}
        </span>
        <Button variant="ghost" size="sm" disabled={list.busy} onClick={() => void list.refresh()}>
          <RefreshCw aria-hidden className="size-3" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
