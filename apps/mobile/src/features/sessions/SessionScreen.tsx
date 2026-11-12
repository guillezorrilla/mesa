import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open. */
export function SessionScreen({ id }: { id: string }) {
  const read = useSessionDetail(id);
  return (
    <Suspense
      fallback={
        <Screen>
          <BusyLine label="Asking your Mac..." />
        </Screen>
      }
    >
      <SessionBody read={read} />
    </Suspense>
  );
}
