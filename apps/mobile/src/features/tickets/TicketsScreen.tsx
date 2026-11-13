import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { TicketsBody } from './TicketsBody';

/** The Work tab's tickets: a project's followed tickets (Mesa's ticket views), one project at a time. */
export function TicketsScreen() {
  const { answer } = useMacRead({ method: 'projects' });
  return (
    <Suspense fallback={<BusyScreen label="Asking for your projects..." />}>
      <TicketsBody projects={answer} />
    </Suspense>
  );
}
