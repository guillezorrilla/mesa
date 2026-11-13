import { useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TabHeader } from '@/components/TabHeader';
import { PrsScreen } from '../prs/PrsScreen';
import { TicketsScreen } from '../tickets/TicketsScreen';

type Segment = 'prs' | 'tickets';
const SEGMENTS = [
  { value: 'prs', label: 'PRs' },
  { value: 'tickets', label: 'Tickets' },
] as const;

/**
 * The Work tab: pull requests or tickets, switched under its title at the top of the list, pull
 * requests first.
 */
export function WorkScreen() {
  const [segment, setSegment] = useState<Segment>('prs');
  const header = (
    <TabHeader
      title="Work"
      below={<SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />}
    />
  );
  return segment === 'prs' ? <PrsScreen header={header} /> : <TicketsScreen header={header} />;
}
