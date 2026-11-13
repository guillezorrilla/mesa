import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { DecideBody } from './DecideBody';

/** Saving a decision for a project, `project` picked first when the screen came from one. */
export function DecideScreen({ project }: { project?: string }) {
  const { answer: read } = useMacRead({ method: 'projects' });
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac for its projects..." />}>
      <DecideBody read={read} project={project} />
    </Suspense>
  );
}
