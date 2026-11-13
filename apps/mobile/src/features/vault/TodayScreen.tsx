import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { TodayBody } from './TodayBody';

/** The day's digest: Impact today, today's Daily note as last built, and the Weekly Rewind. */
export function TodayScreen() {
  const { answer: read } = useMacRead({ method: 'today' });
  return (
    <Suspense fallback={<BusyScreen label="Reading today..." />}>
      <TodayBody read={read} />
    </Suspense>
  );
}
