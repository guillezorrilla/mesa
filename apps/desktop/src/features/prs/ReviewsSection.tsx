import type { PrSetupRow } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { CheckedLine } from './CheckedLine';
import { ReviewsList } from './ReviewsList';
import { useGrouping } from './useGrouping';
import type { usePrs } from './usePrs';

/** The sidebar's Reviews tab: the grouping toggle, the list, and when it was read with Refresh. */
export function ReviewsSection(props: {
  prs: ReturnType<typeof usePrs>;
  onSetup: (row: PrSetupRow) => void;
}) {
  const { list } = props.prs;
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
          <ReviewsList list={list.data} by={by} onSetup={props.onSetup} now={now} />
        ) : (
          <Muted className="px-2">
            {list.error ? list.error.message : 'Reading pull requests...'}
          </Muted>
        )}
      </div>
      <CheckedLine prs={props.prs} now={now} className="border-t px-1 pt-2" />
    </div>
  );
}
