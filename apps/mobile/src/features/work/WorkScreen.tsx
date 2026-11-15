import { SegmentedControl } from '@/components/SegmentedControl';
import { TabHeader } from '@/components/TabHeader';
import { useKept } from '@/lib/useKept';
import { PrsScreen } from '../prs/PrsScreen';
import { TicketsScreen } from '../tickets/TicketsScreen';

const SEGMENTS = [
  { value: 'prs', label: 'PRs' },
  { value: 'tickets', label: 'Tickets' },
] as const;

/**
 * The Work tab: pull requests or tickets, switched under its title at the top of the list, pull
 * requests first; the one last shown is kept across visits.
 */
export function WorkScreen() {
  const [kept, setSegment] = useKept('work.segment');
  const segment = kept === 'tickets' ? 'tickets' : 'prs';
  const header = (
    <TabHeader
      title="Work"
      below={<SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />}
    />
  );
  return segment === 'prs' ? <PrsScreen header={header} /> : <TicketsScreen header={header} />;
}
