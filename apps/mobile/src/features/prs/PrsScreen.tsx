import { type ReactNode, Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { PrList } from './PrList';
import { usePrs } from './usePrs';

/** The pull requests that need you, in Mesa's buckets, under `header`, pulled to read again. */
export function PrsScreen({ header }: { header?: ReactNode }) {
  const { answer, pull, refreshing } = usePrs();
  return (
    <Suspense fallback={<BusyScreen label="Reading your pull requests..." header={header} />}>
      <PrList answer={answer} header={header} refreshing={refreshing} onRefresh={pull} />
    </Suspense>
  );
}
