import { type ReactNode, Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { TicketsBody } from './TicketsBody';

/**
 * The Work tab's tickets: a project's followed tickets (Mesa's ticket views), one project at a
 * time, under `header`.
 */
export function TicketsScreen({ header }: { header?: ReactNode }) {
  const { answer } = useMacRead({ method: 'projects' });
  return (
    <Suspense fallback={<BusyScreen label="Asking for your projects..." header={header} />}>
      <TicketsBody projects={answer} header={header} />
    </Suspense>
  );
}
