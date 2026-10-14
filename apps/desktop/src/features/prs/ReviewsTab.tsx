import type { PrSetupRow } from '@mesa/core';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckedLine } from './CheckedLine';
import { ReviewsList } from './ReviewsList';
import { usePrs } from './usePrs';

/**
 * A project's Reviews tab: its open PRs grouped by status, read when the tab opens; All open PRs
 * adds the ones not for me.
 */
export function ReviewsTab(props: {
  project: string;
  all: boolean;
  onAll: (all: boolean) => void;
  onSetup: (row: PrSetupRow) => void;
}) {
  const prs = usePrs({ project: props.project, ...(props.all ? { all: true } : {}) });
  const now = Date.now();
  return (
    <div data-testid="reviews-tab" className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Switch id="reviews-all" checked={props.all} onCheckedChange={props.onAll} />
        <Label htmlFor="reviews-all">All open PRs</Label>
        <CheckedLine prs={prs} now={now} className="ml-auto" />
      </div>
      <ReviewsList read={prs.list} by="status" onSetup={props.onSetup} now={now} />
    </div>
  );
}
