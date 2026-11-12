import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useLiveRead } from '../mac/useLiveRead';
import { AutomationsBody } from './AutomationsBody';

/** The Automations tab: runs waiting for approval, the rules as sentences, and recent runs. */
export function AutomationsScreen() {
  const { answer, again } = useLiveRead({ method: 'automations' });
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
      <AutomationsBody answer={answer} onChanged={again} />
    </Suspense>
  );
}
