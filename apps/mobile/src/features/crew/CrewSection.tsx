import { Suspense } from 'react';
import { CrewBody } from './CrewBody';
import { useCrew } from './useCrew';

/** A coordinator's crew on its session screen, read on its own so the rest shows first. */
export function CrewSection({ id }: { id: string }) {
  const crew = useCrew(id);
  return (
    <Suspense fallback={null}>
      <CrewBody read={crew} />
    </Suspense>
  );
}
