import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { TabHeader } from '@/components/TabHeader';
import { useLiveRead } from '../mac/useLiveRead';
import { UsageBody } from './UsageBody';

/** The Usage tab: estimated cost by period, day and session, the alerts, and context. */
export function UsageScreen() {
  const { answer } = useLiveRead({ method: 'usage' });
  const header = <TabHeader title="Usage" />;
  return (
    <Suspense fallback={<BusyScreen label="Counting usage on your Mac..." header={header} />}>
      <UsageBody answer={answer} header={header} />
    </Suspense>
  );
}
