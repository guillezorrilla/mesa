import { Stack } from 'expo-router';
import { useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/ui/text';
import { PrsScreen } from '../prs/PrsScreen';

type Segment = 'prs' | 'tickets';
const SEGMENTS = [
  { value: 'prs', label: 'PRs' },
  { value: 'tickets', label: 'Tickets' },
] as const;

/** The Work tab: pull requests or tickets, switched in its title bar, pull requests first. */
export function WorkScreen() {
  const [segment, setSegment] = useState<Segment>('prs');
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <SegmentedControl
              options={SEGMENTS}
              value={segment}
              onChange={setSegment}
              className="w-56"
            />
          ),
        }}
      />
      {segment === 'prs' ? <PrsScreen /> : <Text>Tickets</Text>}
    </>
  );
}
