import { type ReactNode, Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { TicketList } from './TicketList';

/** `project`'s followed tickets under `header`, pulled to read again; key it by project. */
export function ProjectTickets({ project, header }: { project: string; header: ReactNode }) {
  const { answer, pull, refreshing } = useMacRead({ method: 'tickets', project });
  return (
    <Suspense fallback={<BusyScreen label="Reading its tickets..." header={header} />}>
      <TicketList
        project={project}
        tickets={answer}
        header={header}
        refreshing={refreshing}
        onRefresh={pull}
      />
    </Suspense>
  );
}
