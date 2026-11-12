import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { NewRuleBody } from './NewRuleBody';

/** A new schedule rule: the Mac's projects first, then the form. */
export function NewRuleScreen() {
  const { answer } = useMacRead({ method: 'automations' });
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac for its projects..." />}>
      <NewRuleBody answer={answer} />
    </Suspense>
  );
}
