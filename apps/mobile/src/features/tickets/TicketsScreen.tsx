import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useProjects } from '../projects/useProjects';
import { TicketsBody } from './TicketsBody';

/** The Tickets tab: a project's followed tickets (Mesa's ticket views), one project at a time. */
export function TicketsScreen() {
  const projects = useProjects();
  return (
    <Suspense fallback={<BusyScreen label="Asking for your projects..." />}>
      <TicketsBody projects={projects} />
    </Suspense>
  );
}
