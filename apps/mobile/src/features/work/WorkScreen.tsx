import { useState } from 'react';
import { View } from 'react-native';
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
    <>
      <TabHeader title="Work" />
      <View className="px-4 pt-1 pb-2">
        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />
      </View>
    </>
  );
  return segment === 'prs' ? <PrsScreen header={header} /> : <TicketsScreen header={header} />;
}
