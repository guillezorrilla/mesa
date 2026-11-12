import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { TicketBody } from './TicketBody';
import { useTicket } from './useTicket';

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
  const read = useTicket(id, site);
  return (
    <Suspense fallback={<BusyScreen label="Reading the ticket..." />}>
      <TicketBody read={read} project={project} site={site} />
    </Suspense>
  );
}
