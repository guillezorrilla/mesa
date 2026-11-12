import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open. */
export function SessionScreen({ id }: { id: string }) {
  const read = useSessionDetail(id);
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
      <SessionBody read={read} />
    </Suspense>
  );
}
