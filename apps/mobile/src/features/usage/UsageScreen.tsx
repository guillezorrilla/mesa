import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useLiveRead } from '../mac/useLiveRead';
import { UsageBody } from './UsageBody';

/** Usage, from the Mac tab: estimated cost by period, day and session, the alerts, and context. */
export function UsageScreen() {
  const { answer } = useLiveRead({ method: 'usage' });
  return (
    <Suspense fallback={<BusyScreen label="Counting usage on your Mac..." />}>
      <UsageBody answer={answer} />
    </Suspense>
  );
}
