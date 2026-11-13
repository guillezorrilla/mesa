import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { SessionView } from './SessionView';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open, shown as its kind (SessionView). */
export function SessionScreen({ id }: { id: string }) {
  const { read, again } = useSessionDetail(id);
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
      <SessionView id={id} read={read} again={again} />
    </Suspense>
  );
}
