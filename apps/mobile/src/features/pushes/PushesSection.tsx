import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { Section } from '@/components/Section';
import { useMacRead } from '../mac/useMacRead';
import { PushesRead } from './PushesRead';

/** The Mac tab's Pushes: the settings once the Mac answers, why not when it does not. */
export function PushesSection() {
  const { answer } = useMacRead({ method: 'pushes' });
  return (
    <Section title="Pushes">
      <Suspense fallback={<BusyLine label="Asking your Mac..." />}>
        <PushesRead answer={answer} />
      </Suspense>
    </Section>
  );
}
