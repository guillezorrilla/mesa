import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { PrList } from './PrList';
import { usePrs } from './usePrs';

/** The pull requests that need you, in Mesa's buckets, pulled to read again. */
export function PrsScreen() {
  const { answer, again, refreshing } = usePrs();
  return (
    <Suspense fallback={<BusyScreen label="Reading your pull requests..." />}>
      <PrList answer={answer} refreshing={refreshing} onRefresh={again} />
    </Suspense>
  );
}
