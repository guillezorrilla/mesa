import type { PrSetupRow } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ReviewsList } from './ReviewsList';
import type { usePrs } from './usePrs';

/**
 * A project's Reviews tab: its open PRs grouped by status, the ones for me unless All open PRs
 * is on. The project screen owns the read, so its tab bar can count the PRs to act on.
 */
export function ReviewsTab(props: {
  project: string;
  prs: ReturnType<typeof usePrs>;
  all: boolean;
  onAll: (all: boolean) => void;
  onSetup: (row: PrSetupRow) => void;
}) {
  const { list, readAt } = props.prs;
  const now = Date.now();
  return (
    <div data-testid="reviews-tab" className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Switch id="reviews-all" checked={props.all} onCheckedChange={props.onAll} />
        <Label htmlFor="reviews-all">All open PRs</Label>
        <span className="ml-auto text-xs text-muted-foreground">
          {readAt ? `Checked ${timeAgo(new Date(readAt).toISOString(), now)}` : ''}
        </span>
        <Button variant="ghost" size="sm" disabled={list.busy} onClick={() => void list.refresh()}>
          <RefreshCw aria-hidden className="size-3" />
          Refresh
        </Button>
      </div>
      {list.data ? (
        <ReviewsList list={list.data} by="status" projects={[]} onSetup={props.onSetup} now={now} />
      ) : (
        <Muted>{list.error ? list.error.message : 'Reading pull requests...'}</Muted>
      )}
    </div>
  );
}
