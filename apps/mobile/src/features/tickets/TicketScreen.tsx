import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { TicketBody } from './TicketBody';

/** One ticket of `project`, read live from its tracker. */
export function TicketScreen({
  id,
  project,
  site,
}: {
  id: string;
  project: string;
  site?: string;
}) {
  const { answer } = useMacRead({ method: 'ticket', id, ...(site ? { site } : {}) });
  return (
    <Suspense fallback={<BusyScreen label="Reading the ticket..." />}>
      <TicketBody read={answer} project={project} site={site} />
    </Suspense>
  );
}
