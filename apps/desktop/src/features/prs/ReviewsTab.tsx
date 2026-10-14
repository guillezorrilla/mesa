import type { PrRow, PrSetupRow } from '@mesa/core';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useKept } from '@/lib/keptValue';
import { CheckedLine } from './CheckedLine';
import { ReviewsList } from './ReviewsList';
import { usePrs } from './usePrs';

/**
 * A project's Reviews tab: its open PRs grouped by status, read when the tab opens; All open PRs
 * adds the ones not for me, and stays as last set across visits and restarts.
 */
export function ReviewsTab(props: {
  project: string;
  onSetup: (row: PrSetupRow) => void;
  onOpen: (pr: PrRow) => void;
}) {
  const [kept, keep] = useKept('mesa.reviews.all');
  const all = kept === 'yes';
  const prs = usePrs({ project: props.project, ...(all ? { all: true } : {}) });
  const now = Date.now();
  return (
    <div data-testid="reviews-tab" className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Switch
          id="reviews-all"
          checked={all}
          onCheckedChange={(on) => keep(on ? 'yes' : undefined)}
        />
        <Label htmlFor="reviews-all">All open PRs</Label>
        <CheckedLine prs={prs} now={now} className="ml-auto" />
      </div>
      <ReviewsList
        read={prs.list}
        by="status"
        onSetup={props.onSetup}
        onOpen={props.onOpen}
        now={now}
      />
    </div>
  );
}
