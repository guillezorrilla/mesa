import type { PrRow, PrSetupRow } from '@mesa/core';
import { SegmentedControl } from '@/components/SegmentedControl';
import type { PrRef } from '@/lib/client/prs';
import { CheckedLine } from './CheckedLine';
import { ReviewsList } from './ReviewsList';
import { useGrouping } from './useGrouping';
import type { Prs } from './usePrs';

/** The sidebar's Reviews tab: the grouping toggle, the list, and when it was read with Refresh. */
export function ReviewsSection(props: {
  prs: Prs;
  onSetup: (row: PrSetupRow) => void;
  onOpen: (pr: PrRow) => void;
  current?: PrRef;
  /** The PRs a live review session works on, with when it started (liveReviews). */
  reviewing?: ReadonlyMap<string, string>;
}) {
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
        <ReviewsList
          read={props.prs.list}
          by={by}
          onSetup={props.onSetup}
          onOpen={props.onOpen}
          current={props.current}
          reviewing={props.reviewing}
          now={now}
        />
      </div>
      <CheckedLine prs={props.prs} now={now} className="border-t px-1 pt-2" />
    </div>
  );
}
