import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { DecideBody } from './DecideBody';
import { useVaultRead } from './useVaultRead';

/** Saving a decision for a project, `project` picked first when the screen came from one. */
export function DecideScreen({ project }: { project?: string }) {
  const read = useVaultRead({ method: 'projects' });
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac for its projects..." />}>
      <DecideBody read={read} project={project} />
    </Suspense>
  );
}
